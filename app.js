/* Здоровье / Health tracker — vanilla JS, no build step, data stays on the device.
 *
 * Storage (localStorage):
 *   health.v2 -> {
 *     version: 2,
 *     data: { sleep: {"YYYY-MM-DD": hours}, water: {..ml}, steps: {..}, workout: {..min}, weight: {..kg}, mood: {..1-5} },
 *     settings: { lang: "ru"|"en", height: cm|null, age: years|null, sex: "m"|"f"|null, activity, kcal: number|null (manual calorie goal),
 *                 goals: { sleep, water, steps, workout, weight } }
 *   }
 *   health.food.v1 -> { "YYYY-MM-DD": [{ id, name, kcal, p, f, c, at, fid?, g? }] }   (food diary, КБЖУ per entry)
 *   health.plan.v1 -> { form: {...}, plan: { v: 2, seed, split, days: [{ wd, tpl, items: [...] }] }, at }
 * Food database (foods.js), exercise library (exercises.js) and coach tips (tips.js) are bundled with the app.
 * v4: everything works fully offline — no backend calls, no external services, no keys.
 * v7: open app (no lock screen). Free + 7-day Pro trial; Pro (pro.js, signed keys) unlocks the AI assistant (ai.js),
 *     the full jaw program, personal skincare, all-time stats and data export. Exercise illustrations: img/ex/<id>.svg.
 * v1 data (sleepTracker.entries / sleepTracker.settings) is migrated automatically on first run and left untouched.
 */
(function () {
  'use strict';

  var STORE_KEY = 'health.v2';
  var V1_ENTRIES = 'sleepTracker.entries';
  var V1_SETTINGS = 'sleepTracker.settings';
  var MIN_YEAR = 2000;
  var ORDER = ['sleep', 'water', 'steps', 'workout', 'weight', 'mood'];

  // ======================================================================
  // i18n
  // ======================================================================
  var I18N = {
    ru: {
      'nav.today': 'Сегодня', 'nav.trends': 'Тренды', 'nav.add': 'Добавить', 'nav.profile': 'Профиль', 'nav.face': 'Лицо',
      'today.title': 'Сегодня', 'today.week': 'Неделя', 'today.goals': 'целей',
      'today.goalsOf': '{n} из {m}',
      'today.emptyText': 'Начните с записи сна или воды — или посмотрите, как всё выглядит на демо-данных.',
      'today.lastNight': 'прошлая ночь', 'today.today': 'сегодня', 'today.latest': 'последний замер',
      'today.tap': 'Нажмите, чтобы записать', 'today.goal': 'цель {g}', 'today.d30': '30 дн.',
      'trends.emptyTitle': 'Нет записей за {y}',
      'trends.emptyText': 'Нажмите на любой кружок, чтобы добавить запись, или загрузите демо-данные.',
      'stats.title': 'Статистика', 'stats.allTime': 'Всё время',
      'stats.avg': 'Среднее', 'stats.avg30': 'Среднее за 30 дней', 'stats.logged': 'Записей',
      'stats.goalMet': 'Цель выполнена', 'stats.streak': 'Текущая серия', 'stats.longest': 'Лучшая серия',
      'stats.current': 'Текущий', 'stats.change30': 'За 30 дней', 'stats.min': 'Минимум', 'stats.max': 'Максимум',
      'stats.bmi': 'ИМТ', 'stats.toGoal': 'До цели', 'stats.goodDays': 'Хороших дней', 'stats.total': 'Всего',
      'stats.bmiHint': 'укажите рост в профиле',
      'goal.title': 'Цель', 'goal.weight': 'Целевой вес',
      'goal.last7': 'Среднее за 7 дней', 'goal.metScope': 'Цель выполнена ({s})', 'goal.noData': 'Пока нет данных',
      'goal.of': '{a} из {b}', 'goal.allTime': 'всё время', 'goal.reached': 'Цель достигнута 🎉',
      'goal.left': 'осталось {v}',
      'chart.last30': 'Последние 30 дней', 'chart.last7': 'Последние 7 дней', 'chart.weight': 'Динамика веса', 'chart.empty': 'Недостаточно данных для графика',
      'sheet.save': 'Сохранить', 'sheet.update': 'Обновить', 'sheet.clear': 'Удалить', 'sheet.history': 'Открыть историю →',
      'sheet.nightOf': 'Ночь на', 'sheet.date': 'Дата', 'sheet.noData': 'пока нет записи', 'sheet.logged': 'записано: {v}',
      'sheet.future': 'Нельзя записать будущую дату', 'sheet.invalid': 'Введите число от {min} до {max}',
      'sheet.saved': 'Сохранено: {v}', 'sheet.cleared': 'Запись удалена', 'sheet.pickMood': 'Выберите настроение',
      'day.lastNight': 'Прошлая ночь', 'day.tonight': 'Эта ночь', 'day.today': 'Сегодня', 'day.yesterday': 'Вчера',
      'add.title': 'Что записать?',
      'profile.title': 'Профиль', 'profile.language': 'Язык', 'profile.height': 'Рост, см', 'profile.goals': 'Цели и что отслеживать',
      'profile.about': 'Работает офлайн · данные только на этом устройстве', 'profile.heightSaved': 'Рост сохранён',
      'data.title': 'Мои данные',
      'data.hint': 'Все данные хранятся только в этом браузере, синхронизации нет. Раз в неделю скачивай копию — это бесплатно. Восстановить: «Импорт JSON».',
      'data.download': 'Скачать мои данные', 'data.import': 'Импорт JSON', 'data.csv': 'Экспорт CSV',
      'data.demo': 'Загрузить демо-данные', 'data.clear': 'Удалить все данные', 'data.install': 'Установить приложение',
      'data.iosHint': 'Установи на iPhone: в Safari <b>Поделиться</b> → <b>На экран «Домой»</b>. Без этого Safari может удалить данные сайта, если не открывать его 7 дней.',
      'data.downloaded': 'Файл сохранён', 'data.csvDone': 'CSV экспортирован',
      'data.invalidJson': 'Это не JSON-файл', 'data.noValid': 'В файле нет подходящих записей',
      'data.confirmImport': 'Импортировать {n}?\nСовпадающие записи будут перезаписаны.',
      'data.imported': 'Импортировано: {n}', 'data.readError': 'Не удалось прочитать файл',
      'data.confirmClear': 'Удалить все записи ({n}) с этого устройства?\nСовет: сначала нажмите «Скачать мои данные».',
      'data.cleared': 'Все данные удалены', 'data.nothing': 'Нечего удалять',
      'data.demoAdded': 'Добавлено демо-записей: {n}', 'data.demoNone': 'Пустых дней для заполнения нет',
      'data.installed': 'Приложение установлено!', 'data.storageError': 'Не удалось сохранить — хранилище заполнено или заблокировано',
      'a11y.prevYear': 'Предыдущий год', 'a11y.nextYear': 'Следующий год',
      'w.night': ['ночь', 'ночи', 'ночей'], 'w.day': ['день', 'дня', 'дней'], 'w.entry': ['запись', 'записи', 'записей'],
      'months': ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
      'weekdays': ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
      'm.sleep': 'Сон', 'm.water': 'Вода', 'm.steps': 'Шаги', 'm.workout': 'Тренировка', 'm.weight': 'Вес', 'm.mood': 'Настроение',
      'legend.sleep': 'Часов сна', 'legend.water': 'Выпито воды', 'legend.steps': 'Шагов за день',
      'legend.workout': 'Минут тренировки', 'legend.weight': 'Отклонение от целевого веса', 'legend.mood': 'Настроение',
      'u.h': 'ч', 'u.ml': 'мл', 'u.l': 'л', 'u.steps': 'шагов', 'u.min': 'мин', 'u.kg': 'кг', 'u.nodata': 'Нет данных',
      'mood.1': 'Ужасно', 'mood.2': 'Плохо', 'mood.3': 'Нормально', 'mood.4': 'Хорошо', 'mood.5': 'Отлично'
    },
    en: {
      'nav.today': 'Today', 'nav.trends': 'Trends', 'nav.add': 'Add', 'nav.profile': 'Profile', 'nav.face': 'Face',
      'today.title': 'Today', 'today.week': 'This week', 'today.goals': 'goals',
      'today.goalsOf': '{n} of {m}',
      'today.emptyText': 'Start by logging your sleep or water — or preview the app with demo data.',
      'today.lastNight': 'last night', 'today.today': 'today', 'today.latest': 'latest',
      'today.tap': 'Tap to log', 'today.goal': 'goal {g}', 'today.d30': '30d',
      'trends.emptyTitle': 'No entries in {y}',
      'trends.emptyText': 'Tap any dot to add an entry, or load demo data.',
      'stats.title': 'Stats', 'stats.allTime': 'All time',
      'stats.avg': 'Average', 'stats.avg30': 'Avg last 30 days', 'stats.logged': 'Entries',
      'stats.goalMet': 'Met goal', 'stats.streak': 'Current streak', 'stats.longest': 'Longest streak',
      'stats.current': 'Current', 'stats.change30': 'Last 30 days', 'stats.min': 'Lowest', 'stats.max': 'Highest',
      'stats.bmi': 'BMI', 'stats.toGoal': 'To goal', 'stats.goodDays': 'Good days', 'stats.total': 'Total',
      'stats.bmiHint': 'set height in Profile',
      'goal.title': 'Goal', 'goal.weight': 'Target weight',
      'goal.last7': 'Last 7 days avg', 'goal.metScope': 'Days meeting goal ({s})', 'goal.noData': 'No data yet',
      'goal.of': '{a} of {b}', 'goal.allTime': 'all time', 'goal.reached': 'Goal reached 🎉',
      'goal.left': '{v} to go',
      'chart.last30': 'Last 30 days', 'chart.last7': 'Last 7 days', 'chart.weight': 'Weight trend', 'chart.empty': 'Not enough data for a chart',
      'sheet.save': 'Save', 'sheet.update': 'Update', 'sheet.clear': 'Clear', 'sheet.history': 'Open history →',
      'sheet.nightOf': 'Night of', 'sheet.date': 'Date', 'sheet.noData': 'no entry yet', 'sheet.logged': 'logged: {v}',
      'sheet.future': "Can't log a future date", 'sheet.invalid': 'Enter a number from {min} to {max}',
      'sheet.saved': 'Saved: {v}', 'sheet.cleared': 'Entry cleared', 'sheet.pickMood': 'Pick a mood',
      'day.lastNight': 'Last night', 'day.tonight': 'Tonight', 'day.today': 'Today', 'day.yesterday': 'Yesterday',
      'add.title': 'What to log?',
      'profile.title': 'Profile', 'profile.language': 'Language', 'profile.height': 'Height, cm', 'profile.goals': 'Goals',
      'profile.about': 'Works offline · data stays on this device', 'profile.heightSaved': 'Height saved',
      'data.title': 'Your data',
      'data.hint': 'Everything is stored only on this device. Export a backup now and then so you never lose it.',
      'data.download': 'Download my data', 'data.import': 'Import JSON', 'data.csv': 'Export CSV',
      'data.demo': 'Load demo data', 'data.clear': 'Clear all data', 'data.install': 'Install app',
      'data.iosHint': 'To install on iPhone: tap <b>Share</b> → <b>Add to Home Screen</b>.',
      'data.downloaded': 'File saved', 'data.csvDone': 'CSV exported',
      'data.invalidJson': 'That file is not valid JSON', 'data.noValid': 'No valid entries found in file',
      'data.confirmImport': 'Import {n}?\nMatching entries will be overwritten.',
      'data.imported': 'Imported: {n}', 'data.readError': 'Could not read file',
      'data.confirmClear': 'Delete all {n} entries from this device?\nTip: tap "Download my data" first.',
      'data.cleared': 'All data cleared', 'data.nothing': 'Nothing to clear',
      'data.demoAdded': 'Added {n} demo entries', 'data.demoNone': 'No empty days to fill',
      'data.installed': 'Installed!', 'data.storageError': 'Could not save — storage is full or blocked',
      'a11y.prevYear': 'Previous year', 'a11y.nextYear': 'Next year',
      'w.night': ['night', 'nights'], 'w.day': ['day', 'days'], 'w.entry': ['entry', 'entries'],
      'months': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      'weekdays': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      'm.sleep': 'Sleep', 'm.water': 'Water', 'm.steps': 'Steps', 'm.workout': 'Workout', 'm.weight': 'Weight', 'm.mood': 'Mood',
      'legend.sleep': 'Hours slept', 'legend.water': 'Water intake', 'legend.steps': 'Steps per day',
      'legend.workout': 'Workout minutes', 'legend.weight': 'Distance from target weight', 'legend.mood': 'Mood',
      'u.h': 'h', 'u.ml': 'ml', 'u.l': 'L', 'u.steps': 'steps', 'u.min': 'min', 'u.kg': 'kg', 'u.nodata': 'No data',
      'mood.1': 'Awful', 'mood.2': 'Bad', 'mood.3': 'Okay', 'mood.4': 'Good', 'mood.5': 'Great'
    }
  };

  // v4: offline food diary, energy calculator, rule-based workouts & coach tips (merged into the dictionaries above)
  var I18N_V4 = {
    ru: {
      'nav.food': 'Питание',
      'profile.age': 'Возраст, лет', 'profile.ageSaved': 'Возраст сохранён', 'profile.sex': 'Пол',
      'sex.m': 'Мужской', 'sex.f': 'Женский', 'sex.mShort': 'М', 'sex.fShort': 'Ж',
      'food.title': 'Питание', 'food.subtitle': 'Дневник КБЖУ · советы', 'food.toWorkouts': 'Тренировки',
      'food.promo': 'Питание', 'food.promoSub': '{a} из {b} ккал', 'food.promoNone': 'Дневник КБЖУ — найдите продукт и добавьте',
      'food.add': 'Добавить еду', 'food.modeDb': 'Из базы', 'food.modeCustom': 'Своё',
      'food.searchPh': 'Найти: гречка, курица, банан…', 'food.recent': 'Недавние', 'food.popular': 'Популярное',
      'food.notFound': 'Ничего не найдено.', 'food.addCustom': 'Добавить «{q}» вручную',
      'food.per100': 'на 100 г', 'food.grams': 'Граммы', 'food.portion': '1 порция · {g} г',
      'food.addBtn': 'Добавить в дневник', 'food.added': 'Добавлено: {n} · {k} ккал', 'food.close': 'Закрыть',
      'food.badGrams': 'Введите вес от 1 до 3000 г',
      'food.cName': 'Название', 'food.cNamePh': 'Например: салат из столовой', 'food.cKcal': 'Ккал', 'food.cP': 'Белки, г',
      'food.cF': 'Жиры, г', 'food.cC': 'Углеводы, г', 'food.cHint': 'Значения на всю порцию. Если не указать ккал, они посчитаются из БЖУ.',
      'food.cInvalid': 'Укажите калории или БЖУ', 'food.customName': 'Своё блюдо',
      'food.diary': 'Дневник', 'food.diaryOf': 'Дневник · {d}', 'food.none': 'Пока ничего не записано — найдите продукт выше.',
      'food.remove': 'Удалить', 'food.removed': 'Удалено из дневника', 'food.meal': 'Приём пищи',
      'food.eaten': 'съедено', 'food.left': 'Осталось {v} ккал', 'food.over': 'Сверх цели +{v} ккал',
      'food.goal': 'Цель {v} ккал', 'food.auto': 'авто', 'food.manual': 'вручную', 'food.edit': 'Изменить',
      'food.goalSave': 'Сохранить', 'food.goalAuto': 'Авто', 'food.goalSaved': 'Цель калорий: {v} ккал',
      'food.goalAutoSet': 'Цель снова считается автоматически', 'food.goalInvalid': 'Введите число от 800 до 6000',
      'food.goalHintAuto': 'Рассчитано по профилю: {why}', 'food.goalHintDef': 'Укажите возраст, рост и вес в «Тренировках», чтобы рассчитать вашу норму.',
      'food.prevDay': 'Предыдущий день', 'food.nextDay': 'Следующий день', 'food.today': 'Сегодня',
      'kbju.kcal': 'ккал', 'kbju.p': 'Белки', 'kbju.f': 'Жиры', 'kbju.c': 'Углеводы', 'kbju.g': 'г',
      'kbju.short': 'Б {p} · Ж {f} · У {c}',
      'coach.title': 'Быстрые ответы', 'coach.tips': 'Советы без воды', 'coach.more': 'Показать все советы', 'coach.less': 'Свернуть',
      'coach.note': 'Общие рекомендации для здоровых взрослых. При заболеваниях — консультация врача.',
      'en.title': 'Энергия и питание', 'en.bmr': 'BMR, ккал', 'en.tdee': 'TDEE, ккал', 'en.target': 'Цель, ккал', 'en.protein': 'Белок, г',
      'en.bmrHint': 'Базовый обмен (Миффлин — Сан Жеор)', 'en.tdeeHint': 'Расход за день с активностью ×{f}',
      'en.adj.fat_loss': 'похудение −20%', 'en.adj.muscle': 'набор +10%', 'en.adj.general': 'поддержание',
      'en.macros': 'Б {p} г · Ж {f} г · У {c} г в день', 'en.proteinRange': 'белок {lo}–{hi} г (1,6–2,2 г/кг)',
      'en.refWeight': 'При ИМТ > 30 белок считается на ориентировочный вес {w} кг.',
      'en.floor': 'Цель не опускается ниже базового обмена и минимума {v} ккал.',
      'en.need': 'Заполните возраст, вес и рост — и здесь появится расчёт калорий и белка.',
      'en.sexHint': 'Пол не указан — расчёт по среднему значению. Укажите пол для точности.',
      'en.diaryAuto': 'Это цель дневника питания (авто).', 'en.diaryManual': 'В дневнике сейчас ручная цель: {v} ккал.',
      'en.useAuto': 'Вернуть авто', 'en.openDiary': '🍽 Открыть дневник',
      'act.sed': 'Сидячий образ жизни (×1,2)', 'act.light': 'Лёгкая активность 1–3 р/нед (×1,375)',
      'act.mod': 'Умеренная 3–5 р/нед (×1,55)', 'act.high': 'Высокая 6–7 р/нед (×1,725)', 'act.very': 'Очень высокая / физ. труд (×1,9)',
      'wk.promoTitle': 'Программа тренировок', 'wk.promoSub': 'План по возрасту, весу и росту',
      'wk.title': 'Тренировки', 'wk.subtitle': 'Программа под ваш возраст, вес и рост', 'wk.back': 'Назад',
      'wk.age': 'Возраст', 'wk.weight': 'Вес, кг', 'wk.height': 'Рост, см', 'wk.sex': 'Пол', 'wk.activity': 'Активность вне тренировок',
      'wk.goal': 'Цель', 'wk.level': 'Уровень', 'wk.equipment': 'Инвентарь', 'wk.days': 'Дней в неделю',
      'wk.g.fat_loss': 'Похудение', 'wk.g.muscle': 'Мышцы', 'wk.g.general': 'Здоровье',
      'wk.l.beginner': 'Новичок', 'wk.l.intermediate': 'Средний', 'wk.l.advanced': 'Опытный',
      'wk.e.none': 'Без инвентаря', 'wk.e.home': 'Дом', 'wk.e.gym': 'Зал',
      'wk.generate': 'Составить программу', 'wk.regenerate': '↻ Другие упражнения',
      'wk.invalid': 'Проверьте: возраст 10–100, вес 25–300 кг, рост 100–250 см',
      'wk.summary': 'Ваша программа', 'wk.notes': 'Советы к программе', 'wk.saved': 'Программа готова',
      'wk.generated': 'Создано {d}', 'wk.perWeek': '{n} в неделю', 'wk.min': '≈{m} мин',
      'wk.sets': '{s}×{r}', 'wk.rest': '⏱ {v}', 'wk.u.s': 'с', 'wk.u.m': 'мин', 'wk.u.side': '/сторону',
      'wk.split.fb': 'Всё тело', 'wk.split.ul': 'Верх / низ', 'wk.split.ppl': 'Жим / тяга / ноги', 'wk.split.mix': 'Верх / низ + кардио',
      'wk.f.fb': 'Всё тело', 'wk.f.upper': 'Верх тела', 'wk.f.lower': 'Низ тела и кор', 'wk.f.push': 'Жим: грудь, плечи, трицепс',
      'wk.f.pull': 'Тяга: спина, бицепс', 'wk.f.legs': 'Ноги и ягодицы', 'wk.f.cond': 'Кардио и кор', 'wk.f.rec': 'Активное восстановление',
      'wk.scheme.fat_loss': '12–15 повторов, короткий отдых 30–45 с, кардио в конце — больше расход калорий.',
      'wk.scheme.muscle': '8–12 повторов в базовых, 10–12 в изолирующих, отдых 60–120 с — рост силы и мышц.',
      'wk.scheme.general': '10–15 повторов, отдых 45–60 с, немного кардио — сила, выносливость и здоровье.',
      'wk.n.progress': 'Прогрессия: когда во всех подходах сделали верх диапазона повторов — добавьте 2,5–5% веса или усложните вариант.',
      'wk.n.rir': 'Заканчивайте подход, когда в запасе остаётся 1–3 повтора с хорошей техникой.',
      'wk.n.beginner': 'Первые 2 недели — освоение техники: лёгкие веса, 2–3 повтора в запасе.',
      'wk.n.fat_loss': 'Питание: ~{k} ккал в день (−20% от расхода) и ~{p} г белка. Плюс 8–10 тыс. шагов.',
      'wk.n.muscle': 'Питание: ~{k} ккал в день (+10% к расходу) и ~{p} г белка. Сон 7–9 ч.',
      'wk.n.general': 'Питание: ~{k} ккал в день (поддержание) и ~{p} г белка. 150+ минут активности в неделю.',
      'wk.n.nutriNone': 'Калории и белок для вашей цели — в блоке «Энергия и питание» выше.',
      'wk.n.age50': 'После 50: разминка 8–10 минут, без прыжков, рабочий диапазон от 8 повторов. При хронических болезнях — согласуйте нагрузку с врачом.',
      'wk.n.teen': 'До 18 лет: техника прежде всего, без работы до отказа и без предельных весов.',
      'wk.n.bmi': 'Прыжковые упражнения исключены, чтобы беречь колени и спину; кардио — ходьба или велотренажёр.',
      'wk.n.none': 'Без инвентаря тягу заменяют «супермен» и австралийские подтягивания под крепким столом. Позже купите резинки или турник.',
      'wk.n.recovery': 'Между тяжёлыми тренировками одной группы мышц — около 48 часов. Каждые 6–8 недель — лёгкая неделя.',
      'wk.n.extraDays': 'Для новичка больше 4 силовых тренировок не нужно — остальные дни отданы кардио и кору.'
    },
    en: {
      'nav.food': 'Food',
      'profile.age': 'Age, years', 'profile.ageSaved': 'Age saved', 'profile.sex': 'Sex',
      'sex.m': 'Male', 'sex.f': 'Female', 'sex.mShort': 'M', 'sex.fShort': 'F',
      'food.title': 'Food', 'food.subtitle': 'Calorie & macro diary · tips', 'food.toWorkouts': 'Workouts',
      'food.promo': 'Food', 'food.promoSub': '{a} of {b} kcal', 'food.promoNone': 'Calorie diary — search a food and add it',
      'food.add': 'Add food', 'food.modeDb': 'Database', 'food.modeCustom': 'Custom',
      'food.searchPh': 'Search: chicken, oats, banana…', 'food.recent': 'Recent', 'food.popular': 'Popular',
      'food.notFound': 'Nothing found.', 'food.addCustom': 'Add “{q}” manually',
      'food.per100': 'per 100 g', 'food.grams': 'Grams', 'food.portion': '1 serving · {g} g',
      'food.addBtn': 'Add to diary', 'food.added': 'Added: {n} · {k} kcal', 'food.close': 'Close',
      'food.badGrams': 'Enter a weight from 1 to 3000 g',
      'food.cName': 'Name', 'food.cNamePh': 'e.g. cafeteria salad', 'food.cKcal': 'kcal', 'food.cP': 'Protein, g',
      'food.cF': 'Fat, g', 'food.cC': 'Carbs, g', 'food.cHint': 'Values for the whole portion. Leave kcal empty to calculate it from macros.',
      'food.cInvalid': 'Enter calories or macros', 'food.customName': 'Custom food',
      'food.diary': 'Diary', 'food.diaryOf': 'Diary · {d}', 'food.none': 'Nothing logged yet — search for a food above.',
      'food.remove': 'Remove', 'food.removed': 'Removed from diary', 'food.meal': 'Meal',
      'food.eaten': 'eaten', 'food.left': '{v} kcal left', 'food.over': '+{v} kcal over goal',
      'food.goal': 'Goal {v} kcal', 'food.auto': 'auto', 'food.manual': 'manual', 'food.edit': 'Edit',
      'food.goalSave': 'Save', 'food.goalAuto': 'Auto', 'food.goalSaved': 'Calorie goal: {v} kcal',
      'food.goalAutoSet': 'Goal is automatic again', 'food.goalInvalid': 'Enter a number from 800 to 6000',
      'food.goalHintAuto': 'Calculated from your profile: {why}', 'food.goalHintDef': 'Enter your age, height and weight in Workouts to calculate your target.',
      'food.prevDay': 'Previous day', 'food.nextDay': 'Next day', 'food.today': 'Today',
      'kbju.kcal': 'kcal', 'kbju.p': 'Protein', 'kbju.f': 'Fat', 'kbju.c': 'Carbs', 'kbju.g': 'g',
      'kbju.short': 'P {p} · F {f} · C {c}',
      'coach.title': 'Quick answers', 'coach.tips': 'No-fluff tips', 'coach.more': 'Show all tips', 'coach.less': 'Show less',
      'coach.note': 'General guidance for healthy adults. With medical conditions, consult a doctor.',
      'en.title': 'Energy & nutrition', 'en.bmr': 'BMR, kcal', 'en.tdee': 'TDEE, kcal', 'en.target': 'Target, kcal', 'en.protein': 'Protein, g',
      'en.bmrHint': 'Resting metabolism (Mifflin-St Jeor)', 'en.tdeeHint': 'Daily burn with activity ×{f}',
      'en.adj.fat_loss': 'fat loss −20%', 'en.adj.muscle': 'muscle gain +10%', 'en.adj.general': 'maintenance',
      'en.macros': 'P {p} g · F {f} g · C {c} g per day', 'en.proteinRange': 'protein {lo}–{hi} g (1.6–2.2 g/kg)',
      'en.refWeight': 'With BMI > 30, protein is based on a reference weight of {w} kg.',
      'en.floor': 'The target never goes below your BMR or {v} kcal.',
      'en.need': 'Fill in age, weight and height to see your calorie and protein targets here.',
      'en.sexHint': 'Sex not set — using an average. Set it for better accuracy.',
      'en.diaryAuto': 'This is your food diary goal (auto).', 'en.diaryManual': 'Your diary currently uses a manual goal: {v} kcal.',
      'en.useAuto': 'Use auto', 'en.openDiary': '🍽 Open diary',
      'act.sed': 'Sedentary (×1.2)', 'act.light': 'Light, 1–3×/week (×1.375)',
      'act.mod': 'Moderate, 3–5×/week (×1.55)', 'act.high': 'High, 6–7×/week (×1.725)', 'act.very': 'Very high / physical job (×1.9)',
      'wk.promoTitle': 'Workout program', 'wk.promoSub': 'A plan for your age, weight and height',
      'wk.title': 'Workouts', 'wk.subtitle': 'A program for your age, weight and height', 'wk.back': 'Back',
      'wk.age': 'Age', 'wk.weight': 'Weight, kg', 'wk.height': 'Height, cm', 'wk.sex': 'Sex', 'wk.activity': 'Activity outside workouts',
      'wk.goal': 'Goal', 'wk.level': 'Level', 'wk.equipment': 'Equipment', 'wk.days': 'Days per week',
      'wk.g.fat_loss': 'Fat loss', 'wk.g.muscle': 'Muscle', 'wk.g.general': 'Health',
      'wk.l.beginner': 'Beginner', 'wk.l.intermediate': 'Intermediate', 'wk.l.advanced': 'Advanced',
      'wk.e.none': 'None', 'wk.e.home': 'Home', 'wk.e.gym': 'Gym',
      'wk.generate': 'Build my program', 'wk.regenerate': '↻ Shuffle exercises',
      'wk.invalid': 'Check: age 10–100, weight 25–300 kg, height 100–250 cm',
      'wk.summary': 'Your program', 'wk.notes': 'Program tips', 'wk.saved': 'Program ready',
      'wk.generated': 'Created {d}', 'wk.perWeek': '{n} per week', 'wk.min': '≈{m} min',
      'wk.sets': '{s}×{r}', 'wk.rest': '⏱ {v}', 'wk.u.s': 's', 'wk.u.m': 'min', 'wk.u.side': '/side',
      'wk.split.fb': 'Full body', 'wk.split.ul': 'Upper / lower', 'wk.split.ppl': 'Push / pull / legs', 'wk.split.mix': 'Upper / lower + cardio',
      'wk.f.fb': 'Full body', 'wk.f.upper': 'Upper body', 'wk.f.lower': 'Lower body & core', 'wk.f.push': 'Push: chest, shoulders, triceps',
      'wk.f.pull': 'Pull: back, biceps', 'wk.f.legs': 'Legs & glutes', 'wk.f.cond': 'Cardio & core', 'wk.f.rec': 'Active recovery',
      'wk.scheme.fat_loss': '12–15 reps, short 30–45 s rest, cardio finisher — more calories burned.',
      'wk.scheme.muscle': '8–12 reps on compounds, 10–12 on isolation, 60–120 s rest — strength and muscle growth.',
      'wk.scheme.general': '10–15 reps, 45–60 s rest, some cardio — strength, endurance and health.',
      'wk.n.progress': 'Progression: once you hit the top of the rep range on all sets, add 2.5–5% weight or use a harder variation.',
      'wk.n.rir': 'End each set with 1–3 reps in reserve and clean form.',
      'wk.n.beginner': 'First 2 weeks are for learning technique: light weights, 2–3 reps in reserve.',
      'wk.n.fat_loss': 'Nutrition: ~{k} kcal/day (−20% of your burn) and ~{p} g protein. Plus 8–10k steps.',
      'wk.n.muscle': 'Nutrition: ~{k} kcal/day (+10% over your burn) and ~{p} g protein. Sleep 7–9 h.',
      'wk.n.general': 'Nutrition: ~{k} kcal/day (maintenance) and ~{p} g protein. 150+ active minutes per week.',
      'wk.n.nutriNone': 'Calories and protein for your goal are in the Energy & nutrition block above.',
      'wk.n.age50': 'Over 50: warm up 8–10 minutes, no jumping, keep reps at 8 or more. With chronic conditions, check the load with your doctor.',
      'wk.n.teen': 'Under 18: technique first, no training to failure and no max weights.',
      'wk.n.bmi': 'Jumping moves are excluded to protect knees and back; cardio is walking or cycling.',
      'wk.n.none': 'With no equipment, pulling is covered by supermans and inverted rows under a sturdy table. Bands or a pull-up bar are a great next step.',
      'wk.n.recovery': 'Allow ~48 hours between hard sessions for the same muscles. Take an easy week every 6–8 weeks.',
      'wk.n.extraDays': 'Beginners don\u2019t need more than 4 strength days — the extra days are cardio and core.'
    }
  };
  ['ru', 'en'].forEach(function (lng) { Object.keys(I18N_V4[lng]).forEach(function (k) { I18N[lng][k] = I18N_V4[lng][k]; }); });

  function t(key, vars) {
    var dict = I18N[settings.lang] || I18N.ru;
    var s = dict[key];
    if (s === undefined) s = I18N.ru[key];
    if (s === undefined) return key;
    if (vars && typeof s === 'string') {
      s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
    }
    return s;
  }
  function locale() { return settings.lang === 'en' ? 'en-US' : 'ru-RU'; }
  function fmtNum(n, maxFrac) {
    return Number(n).toLocaleString(locale(), { maximumFractionDigits: maxFrac === undefined ? 1 : maxFrac });
  }
  function pluralWord(n, wordKey) {
    var forms = t(wordKey);
    var cat = new Intl.PluralRules(locale()).select(n);
    if (settings.lang === 'ru') return cat === 'one' ? forms[0] : cat === 'few' ? forms[1] : forms[2];
    return cat === 'one' ? forms[0] : forms[1];
  }
  function plural(n, wordKey) { return fmtNum(n, 0) + ' ' + pluralWord(n, wordKey); }

  // ======================================================================
  // Metric definitions
  // ======================================================================
  var METRICS = {
    sleep: {
      icon: '🌙', unit: 'u.h', min: 0, max: 16, step: 0.5, sliderMax: 12, frac: 1, night: true,
      goal: { def: 8, min: 4, max: 12, step: 0.5 }, word: 'w.night',
      colors: ['#9f2a6b', '#3f3a9e', '#6366f1', '#a78bfa', '#60a5fa'],
      legend: function () { var u = t('u.h'); return ['<6' + u, '6–7' + u, '7–8' + u, '8–9' + u, '9' + u + '+']; },
      bucket: function (v) { return v < 6 ? 0 : v < 7 ? 1 : v < 8 ? 2 : v < 9 ? 3 : 4; },
      chips: [6, 7, 7.5, 8, 9], defVal: function (g) { return g; }
    },
    water: {
      icon: '💧', unit: 'u.ml', min: 0, max: 10000, step: 50, sliderMax: 4000, frac: 0,
      goal: { def: 2000, min: 500, max: 5000, step: 250 }, word: 'w.day',
      colors: ['#1e2a5e', '#1e40af', '#2563eb', '#3b82f6', '#93c5fd'],
      legend: function () {
        var l = t('u.l'), d = settings.lang === 'ru' ? ',' : '.';
        return ['<1 ' + l, '1–1' + d + '5', '1' + d + '5–2', '2–2' + d + '5', '2' + d + '5 ' + l + '+'];
      },
      bucket: function (v) { return v < 1000 ? 0 : v < 1500 ? 1 : v < 2000 ? 2 : v < 2500 ? 3 : 4; },
      chips: ['+150', '+250', '+500', 1500, 2000], defVal: function () { return 0; }
    },
    steps: {
      icon: '👟', unit: 'u.steps', min: 0, max: 100000, step: 100, sliderMax: 25000, frac: 0,
      goal: { def: 10000, min: 2000, max: 30000, step: 1000 }, word: 'w.day',
      colors: ['#3b1a52', '#6b21a8', '#a21caf', '#d946ef', '#f0abfc'],
      legend: function () { return ['<3k', '3–6k', '6–9k', '9–12k', '12k+']; },
      bucket: function (v) { return v < 3000 ? 0 : v < 6000 ? 1 : v < 9000 ? 2 : v < 12000 ? 3 : 4; },
      chips: [3000, 6000, 8000, 10000, 12000], defVal: function () { return 8000; }
    },
    workout: {
      icon: '🏋️', unit: 'u.min', min: 0, max: 600, step: 5, sliderMax: 180, frac: 0,
      goal: { def: 30, min: 5, max: 180, step: 5 }, word: 'w.day',
      colors: ['#272463', '#3730a3', '#4f46e5', '#818cf8', '#c7d2fe'],
      legend: function () { var m = t('u.min'); return ['<15', '15–30', '30–60', '60–90', '90+ ' + m]; },
      bucket: function (v) { return v < 15 ? 0 : v < 30 ? 1 : v < 60 ? 2 : v < 90 ? 3 : 4; },
      chips: [15, 30, 45, 60, 90], defVal: function (g) { return g; }
    },
    weight: {
      icon: '⚖️', unit: 'u.kg', min: 20, max: 300, step: 0.1, sliderMin: 40, sliderMax: 150, frac: 1,
      goal: { def: null, min: 30, max: 200, step: 0.5, optional: true }, word: 'w.entry', chart: 'line',
      colors: ['#9f2a6b', '#7e3fb0', '#7c6cf2', '#60a5fa'],
      legend: function () { var k = t('u.kg'); return ['>6 ' + k, '3–6', '1–3', '≤1 ' + k]; },
      bucket: function (v) {
        var g = settings.goals.weight;
        if (!g) return 3;
        var d = Math.abs(v - g);
        return d <= 1 ? 3 : d <= 3 ? 2 : d <= 6 ? 1 : 0;
      },
      chips: [], defVal: function () { return 70; }
    },
    mood: {
      icon: '🙂', unit: '', min: 1, max: 5, step: 1, frac: 0, word: 'w.day', isMood: true,
      colors: ['#9f2a6b', '#8b3fae', '#6d5bd0', '#8b5cf6', '#60a5fa'],
      emojis: ['😫', '😕', '😐', '🙂', '😄'],
      legend: function () { return METRICS.mood.emojis.map(function (e, i) { return e + ' ' + t('mood.' + (i + 1)); }); },
      bucket: function (v) { return Math.max(0, Math.min(4, Math.round(v) - 1)); },
      chips: [], defVal: function () { return 3; }
    }
  };

  function color(id, v) { var m = METRICS[id]; return m.colors[m.bucket(v)]; }
  function unit(id) { return METRICS[id].unit ? t(METRICS[id].unit) : ''; }
  function fmtVal(id, v, withUnit) {
    var m = METRICS[id];
    if (m.isMood) return m.emojis[m.bucket(v)];
    if (id === 'water' && withUnit === 'short' && v >= 1000) return fmtNum(v / 1000, 2) + ' ' + t('u.l');
    if (id === 'steps') return fmtNum(v, 0) + (withUnit ? ' ' + t('u.steps') : '');
    return fmtNum(v, m.frac) + (withUnit ? ' ' + unit(id) : '');
  }
  function goalOf(id) { return METRICS[id].goal ? settings.goals[id] : null; }
  function meetsGoal(id, v) {
    if (id === 'mood') return v >= 4;
    if (id === 'weight') { var g = settings.goals.weight; return g ? Math.abs(v - g) <= 0.5 : false; }
    return v >= goalOf(id);
  }

  // ======================================================================
  // Dates (local time)
  // ======================================================================
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isValidKey(k) { return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && toKey(parseKey(k)) === k; }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function todayKey() { return toKey(today()); }
  function yesterdayKey() { return toKey(addDays(today(), -1)); }
  function dayDiff(a, b) { return Math.round((b - a) / 86400000); }
  function fmtLong(k) { return parseKey(k).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function fmtShort(k) { return parseKey(k).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function defaultKey(id) { return METRICS[id].night ? yesterdayKey() : todayKey(); }
  function dayName(id, k) {
    if (METRICS[id].night) {
      if (k === yesterdayKey()) return t('day.lastNight');
      if (k === todayKey()) return t('day.tonight');
    } else {
      if (k === todayKey()) return t('day.today');
      if (k === yesterdayKey()) return t('day.yesterday');
    }
    return cap(fmtShort(k));
  }

  // ======================================================================
  // Storage
  // ======================================================================
  function emptyData() { var d = {}; ORDER.forEach(function (k) { d[k] = {}; }); return d; }
  function defaultSettings() {
    var g = {};
    ORDER.forEach(function (k) { if (METRICS[k].goal) g[k] = METRICS[k].goal.def; });
    return { lang: 'ru', height: null, age: null, sex: null, activity: 'light', kcal: null, goals: g };
  }
  function sanitizeMap(id, obj) {
    var out = {}, m = METRICS[id];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    Object.keys(obj).forEach(function (k) {
      var v = Number(obj[k]);
      if (obj[k] !== null && obj[k] !== '' && isValidKey(k) && isFinite(v) && v >= m.min && v <= m.max) out[k] = Math.round(v * 100) / 100;
    });
    return out;
  }
  function sanitizeSettings(s) {
    var d = defaultSettings();
    if (!s || typeof s !== 'object') return d;
    d.lang = 'ru';   // v9.4: the app is Russian-only (an old stored 'en' is ignored)
    var hgt = Number(s.height);
    if (s.height !== null && s.height !== undefined && isFinite(hgt) && hgt >= 80 && hgt <= 250) d.height = hgt;
    var age = Number(s.age);
    if (s.age !== null && s.age !== undefined && isFinite(age) && age >= 10 && age <= 100) d.age = Math.round(age);
    if (s.sex === 'm' || s.sex === 'f') d.sex = s.sex;
    if (['sed', 'light', 'mod', 'high', 'very'].indexOf(s.activity) >= 0) d.activity = s.activity;
    var kc = Number(s.kcal);
    if (s.kcal !== null && s.kcal !== undefined && isFinite(kc) && kc >= 800 && kc <= 6000) d.kcal = Math.round(kc);
    if (s.goals && typeof s.goals === 'object') {
      Object.keys(d.goals).forEach(function (k) {
        var gm = METRICS[k].goal, v = s.goals[k];
        if (v === null || v === undefined) { if (gm.optional) d.goals[k] = null; return; }
        v = Number(v);
        if (isFinite(v) && v >= gm.min && v <= gm.max) d.goals[k] = v;
      });
    }
    return d;
  }
  function writeStore(st) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ version: 2, data: st.data, settings: st.settings }));
      return true;
    } catch (e) { return false; }
  }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { /* storage blocked */ }
    if (raw) {
      try {
        var obj = JSON.parse(raw);
        var data = emptyData();
        ORDER.forEach(function (k) { data[k] = sanitizeMap(k, obj.data && obj.data[k]); });
        return { data: data, settings: sanitizeSettings(obj.settings) };
      } catch (e) { console.warn('Corrupt store, starting fresh', e); }
    }
    // First run of v2: migrate v1 sleep data (kept untouched as a fallback copy)
    var st = { data: emptyData(), settings: defaultSettings() };
    try {
      var v1 = localStorage.getItem(V1_ENTRIES);
      if (v1) st.data.sleep = sanitizeMap('sleep', JSON.parse(v1));
      var v1s = localStorage.getItem(V1_SETTINGS);
      if (v1s) {
        var g = Number(JSON.parse(v1s).goal);
        if (isFinite(g) && g >= 4 && g <= 12) st.settings.goals.sleep = g;
      }
    } catch (e) { /* ignore */ }
    writeStore(st);
    return st;
  }
  METRICS.water.btnStep = 250;
  METRICS.steps.btnStep = 500;

  // ======================================================================
  // State & DOM
  // ======================================================================
  var store = load();
  var settings = store.settings;
  var state = {
    view: null, metric: 'sleep', year: new Date().getFullYear(), scope: 'year',
    sheet: { id: null, key: null, value: null }, deferredInstall: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    todayDate: $('todayDate'), todayScore: $('todayScore'), todayCards: $('todayCards'),
    weekGrid: $('weekGrid'), todayEmpty: $('todayEmpty'),
    metricTabs: $('metricTabs'), yearLabel: $('yearLabel'), countLabel: $('countLabel'),
    prevYear: $('prevYear'), nextYear: $('nextYear'),
    grid: $('grid'), months: $('months'), dayLabels: $('dayLabels'), scroll: $('heatmapScroll'),
    legendTitle: $('legendTitle'), legendItems: $('legendItems'),
    emptyState: $('emptyState'), emptyTitle: $('emptyTitle'), emptyEmoji: $('emptyEmoji'),
    goalCard: $('goalCard'), goalTitle: $('goalTitle'), goalValue: $('goalValue'),
    goalMinus: $('goalMinus'), goalPlus: $('goalPlus'), goalProgress: $('goalProgress'),
    chartTitle: $('chartTitle'), chart: $('chart'),
    scopeYear: $('scopeYear'), scopeAll: $('scopeAll'), stats: $('stats'),
    heightInput: $('heightInput'), ageInput: $('ageInput'), goalsList: $('goalsList'),
    importFile: $('importFile'), installBtn: $('installBtn'), iosHint: $('iosHint'),
    addBtn: $('addBtn'), addSheet: $('addSheet'), addGrid: $('addGrid'),
    backdrop: $('sheetBackdrop'), logSheet: $('logSheet'),
    sheetKicker: $('sheetKicker'), sheetTitle: $('sheetTitle'), sheetCurrent: $('sheetCurrent'),
    dateLbl: $('dateLbl'), dateInput: $('dateInput'),
    numericInput: $('numericInput'), moodInput: $('moodInput'),
    valMinus: $('valMinus'), valPlus: $('valPlus'), valInput: $('valInput'), valUnit: $('valUnit'),
    valRange: $('valRange'), rangeScale: $('rangeScale'), chips: $('chips'),
    saveBtn: $('saveBtn'), clearEntryBtn: $('clearEntryBtn'), historyBtn: $('historyBtn'),
    toast: $('toast'),
    foodPromoSub: $('foodPromoSub'), profileSex: $('profileSex'),
    foodSummary: $('foodSummary'), foodAddCard: $('foodAddCard'), foodDbPane: $('foodDbPane'), foodSearch: $('foodSearch'),
    foodResults: $('foodResults'), foodPick: $('foodPick'), foodCustom: $('foodCustom'),
    cName: $('cName'), cKcal: $('cKcal'), cP: $('cP'), cF: $('cF'), cC: $('cC'),
    foodDiary: $('foodDiary'), foodDiaryTitle: $('foodDiaryTitle'), qaChips: $('qaChips'), qaAnswer: $('qaAnswer'), tipsList: $('tipsList'),
    wkForm: $('wkForm'), wkAge: $('wkAge'), wkWeight: $('wkWeight'), wkHeight: $('wkHeight'), wkSex: $('wkSex'), wkActivity: $('wkActivity'),
    wkGoal: $('wkGoal'), wkLevel: $('wkLevel'), wkEquip: $('wkEquip'), wkDays: $('wkDays'), wkEnergy: $('wkEnergy'),
    wkDaysMinus: $('wkDaysMinus'), wkDaysPlus: $('wkDaysPlus'), wkSubmit: $('wkSubmit'), wkResult: $('wkResult')
  };

  function persist() {
    var ok = writeStore(store);
    if (!ok) toast(t('data.storageError'));
    return ok;
  }

  function h(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style') n.style.cssText = v;
      else if (k === 'tabIndex') n.tabIndex = v;
      else n.setAttribute(k, v);
    });
    (children || []).forEach(function (c) {
      if (c !== null && c !== undefined) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 2200);
  }

  // ======================================================================
  // Data helpers
  // ======================================================================
  function has(id, k) { return Object.prototype.hasOwnProperty.call(store.data[id], k); }
  function get(id, k) { return has(id, k) ? store.data[id][k] : null; }
  function keys(id) { return Object.keys(store.data[id]).sort(); }
  function keysForYear(id, y) { var p = y + '-'; return keys(id).filter(function (k) { return k.indexOf(p) === 0; }); }
  function scopeKeys(id) { return state.scope === 'year' ? keysForYear(id, state.year) : keys(id); }
  function totalEntries() { return ORDER.reduce(function (n, id) { return n + Object.keys(store.data[id]).length; }, 0); }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function windowEnd(id) {
    // Count windows/streaks up to today if today is logged, otherwise up to yesterday
    var t0 = today();
    return has(id, toKey(t0)) ? t0 : addDays(t0, -1);
  }
  function lastN(id, n) {
    var end = windowEnd(id), out = [];
    for (var i = 0; i < n; i++) { var k = toKey(addDays(end, -i)); if (has(id, k)) out.push(get(id, k)); }
    return out;
  }
  function currentStreak(id) {
    var d = windowEnd(id), n = 0;
    while (has(id, toKey(d))) { n++; d = addDays(d, -1); }
    return n;
  }
  function longestStreak(ks) {
    var best = 0, run = 0, prev = null;
    ks.forEach(function (k) {
      var d = parseKey(k);
      run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    });
    return best;
  }
  function maxYear() {
    var y = new Date().getFullYear();
    ORDER.forEach(function (id) { keys(id).forEach(function (k) { var ky = +k.slice(0, 4); if (ky > y) y = ky; }); });
    return y;
  }
  function latestWeight() {
    var ks = keys('weight');
    return ks.length ? { key: ks[ks.length - 1], v: get('weight', ks[ks.length - 1]) } : null;
  }
  function weightOnOrBefore(daysAgo) {
    var limit = toKey(addDays(today(), -daysAgo));
    var ks = keys('weight').filter(function (k) { return k <= limit; });
    return ks.length ? get('weight', ks[ks.length - 1]) : null;
  }
  function signed(d, frac) { return (d > 0 ? '+' : d < 0 ? '−' : '±') + fmtNum(Math.abs(d), frac); }

  // ======================================================================
  // SVG helpers
  // ======================================================================
  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }
  var ringSeq = 0;
  var GRAD = 'linear-gradient(90deg,#8b5cf6,#60a5fa)';
  function ring(size, stroke, pct, col) {
    var r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct)), mid = size / 2;
    var svg = svgEl('svg', { class: 'ring', width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { class: 'track', cx: mid, cy: mid, r: r, 'stroke-width': stroke }));
    if (col === 'grad') {
      // violet → blue gradient stroke (unique id per ring)
      var gid = 'htRing' + (++ringSeq), defs = svgEl('defs'), lg = svgEl('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' });
      lg.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#a78bfa' }));
      lg.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#60a5fa' }));
      defs.appendChild(lg); svg.appendChild(defs);
      col = 'url(#' + gid + ')';
      svg.setAttribute('class', 'ring glow');
    }
    svg.appendChild(svgEl('circle', {
      class: 'prog', cx: mid, cy: mid, r: r, 'stroke-width': stroke, stroke: col,
      'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - p), 'stroke-opacity': p === 0 ? 0 : 1,
      transform: 'rotate(-90 ' + mid + ' ' + mid + ')'
    }));
    return svg;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function kfmt(v) { return v >= 1000 ? fmtNum(v / 1000, 1) + 'k' : fmtNum(v, 0); }

  // ======================================================================
  // v7: Pro gating helpers
  // ======================================================================
  function isPro() { return !window.HTPro || window.HTPro.isPro(); }
  function proBadge() { return window.HTPro ? window.HTPro.badge() : ''; }
  function proLink(text, from) {
    var a = h('a', { class: 'pro-inline', href: '#buy/' + from });
    a.innerHTML = proBadge();
    a.appendChild(document.createTextNode(' ' + text));
    return a;
  }
  function renderProBanner() {
    var box = document.getElementById('proBanner'); if (!box || !window.HTPro) return;
    var st = window.HTPro.status(), l = window.HTPro.statusLine(st);
    box.hidden = !(st.tier === 'trial' || st.tier === 'free' || st.tier === 'paused');
    if (box.hidden) return;
    box.className = 'pro-banner ' + l.cls;
    box.innerHTML = '<span class="pro-banner-ic" aria-hidden="true">' + (st.tier === 'trial' ? '★' : '🔒') + '</span><span class="grow"><b>' + l.t + '</b><small>' +
      (st.tier === 'trial' ? 'Все функции Про открыты. Потом — бесплатная версия или Про от 399 ₽/мес.' : st.tier === 'paused' ? l.s : 'ИИ-ассистент, вся программа и статистика — в Про.') +
      '</small></span><span class="pro-banner-go">' + (st.tier === 'trial' ? 'Подробнее' : 'Купить') + '</span>';
  }

  // ======================================================================
  // TODAY view
  // ======================================================================
  var GOAL_IDS = ['sleep', 'water', 'steps', 'workout'];
  function metricOn(id) { return !window.V9 || window.V9.goalOn(id); }

  function renderToday() {
    renderFoodPromo();
    renderProBanner();
    var aiSub = document.getElementById('aiPromoSub');
    if (aiSub) aiSub.textContent = isPro() ? 'Спроси про свой сон, еду и тренировки' : 'Доступно в Про';
    el.todayDate.textContent = cap(today().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }));
    // v9: only the goals the user switched on count for the ring
    var gids = GOAL_IDS.filter(metricOn);
    var done = gids.filter(function (id) { var v = get(id, defaultKey(id)); return v !== null && meetsGoal(id, v); }).length;
    el.todayScore.innerHTML = '';
    el.todayScore.hidden = !gids.length;
    el.todayScore.appendChild(h('div', { class: 'score-text' }, [
      h('b', { text: t('today.goalsOf', { n: done, m: gids.length }) }), t('today.goals')
    ]));
    el.todayScore.appendChild(ring(46, 6, gids.length ? done / gids.length : 0, 'grad'));

    var frag = document.createDocumentFragment();
    ORDER.filter(metricOn).forEach(function (id) { frag.appendChild(todayCard(id)); });
    el.todayCards.innerHTML = '';
    el.todayCards.appendChild(frag);
    renderWeek();
    el.todayEmpty.hidden = totalEntries() > 0;
    if (window.V9) window.V9.renderTodayTop();
  }

  function valueNode(id, v) {
    var n = h('div', { class: 'mcard-val' + (v === null ? ' none' : '') });
    if (v === null) { n.textContent = '—'; return n; }
    n.appendChild(document.createTextNode(fmtNum(v, METRICS[id].frac)));
    if (id !== 'steps') n.appendChild(h('small', { text: unit(id) }));
    return n;
  }

  function todayCard(id) {
    var m = METRICS[id], k = defaultKey(id), v = get(id, k);
    var card = h('div', { class: 'mcard', role: 'button', tabIndex: 0, 'data-open': id, 'aria-label': t('m.' + id) });
    var sub = m.night ? t('today.lastNight') : id === 'weight' ? t('today.latest') : t('today.today');
    card.appendChild(h('div', { class: 'mcard-head' }, [
      h('div', { class: 'mcard-name' }, [h('i', { text: m.icon }), t('m.' + id)]),
      h('div', { class: 'mcard-sub', text: sub })
    ]));

    if (id === 'mood') {
      card.appendChild(h('div', { class: 'mcard-val' + (v === null ? ' none' : ''), text: v === null ? '—' : t('mood.' + v) }));
      var row = h('div', { class: 'mood-row' });
      m.emojis.forEach(function (e, i) {
        row.appendChild(h('button', { type: 'button', class: v === i + 1 ? 'on' : '', 'data-mood': i + 1, 'aria-label': t('mood.' + (i + 1)), text: e }));
      });
      card.appendChild(row);
      return card;
    }

    if (id === 'weight') {
      var lw = latestWeight();
      card.appendChild(valueNode('weight', lw ? lw.v : null));
      var info;
      if (lw) {
        var past = weightOnOrBefore(30);
        info = past !== null && keys('weight').length > 1
          ? signed(lw.v - past, 1) + ' ' + t('u.kg') + ' · ' + t('today.d30')
          : cap(fmtShort(lw.key));
        if (settings.goals.weight) info += ' · ' + t('today.goal', { g: fmtNum(settings.goals.weight, 1) });
      } else info = t('today.tap');
      card.appendChild(h('div', { class: 'mcard-sub', text: info }));
      var fc = window.V9Insights && window.V9Insights.forecastLine();
      if (fc) card.appendChild(h('div', { class: 'mcard-sub v9-fc', text: fc }));
      return card;
    }

    var g = goalOf(id);
    card.appendChild(valueNode(id, v));
    var pct = v === null ? 0 : Math.min(1, v / g);
    var fill = v === null ? 'transparent' : pct >= 1 ? GRAD : color(id, v);
    card.appendChild(h('div', { class: 'mcard-bar' }, [h('div', { style: 'width:' + Math.round(pct * 100) + '%;background:' + fill })]));
    if (id === 'water') {
      card.appendChild(h('div', { class: 'mcard-actions' }, [
        h('button', { type: 'button', class: 'mini-btn', 'data-water': 250, text: '+250' }),
        h('button', { type: 'button', class: 'mini-btn', 'data-water': 500, text: '+500' })
      ]));
    } else {
      var stl = id === 'sleep' && window.V9Sleep ? window.V9Sleep.line(k) : '';   // v9.1: «23:40–07:20»
      card.appendChild(h('div', { class: 'mcard-sub', text: (stl ? stl + ' · ' : '') + t('today.goal', { g: fmtVal(id, g, true) }) }));
    }
    return card;
  }

  function renderWeek() {
    var wg = el.weekGrid, t0 = today(), wd = t('weekdays'), days = [];
    for (var i = 6; i >= 0; i--) days.push(addDays(t0, -i));
    wg.innerHTML = '';
    wg.appendChild(h('div'));
    days.forEach(function (d) {
      wg.appendChild(h('div', { class: 'wk-h' + (toKey(d) === toKey(t0) ? ' today' : ''), text: wd[(d.getDay() + 6) % 7] }));
    });
    ORDER.filter(metricOn).forEach(function (id) {
      var m = METRICS[id];
      wg.appendChild(h('div', { class: 'wk-name', text: m.icon + ' ' + t('m.' + id) }));
      days.forEach(function (d) {
        var k = toKey(d), v = get(id, k);
        var label = t('m.' + id) + ' · ' + fmtShort(k) + ' · ' + (v === null ? t('u.nodata') : fmtVal(id, v, true));
        var b = h('button', {
          type: 'button', class: 'wk-dot' + (m.isMood ? ' mood-dot' : '') + (v !== null ? ' has' : ''),
          'data-metric': id, 'data-key': k, title: label, 'aria-label': label
        });
        if (v !== null) {
          if (m.isMood) b.textContent = fmtVal(id, v);
          else b.style.setProperty('--c', color(id, v));
        }
        wg.appendChild(b);
      });
    });
  }

  // ======================================================================
  // TRENDS view
  // ======================================================================
  function renderTrends(opts) {
    var id = state.metric, m = METRICS[id];
    el.metricTabs.innerHTML = '';
    ORDER.forEach(function (mid) {
      el.metricTabs.appendChild(h('button', {
        type: 'button', role: 'tab', class: 'mtab' + (id === mid ? ' active' : ''),
        'data-metric-tab': mid, 'aria-selected': String(id === mid)
      }, [METRICS[mid].icon + ' ' + t('m.' + mid)]));
    });

    var n = keysForYear(id, state.year).length;
    el.yearLabel.textContent = state.year;
    el.countLabel.innerHTML = '';
    el.countLabel.appendChild(h('b', { text: fmtNum(n, 0) }));
    el.countLabel.appendChild(document.createTextNode(' ' + pluralWord(n, m.word)));
    el.prevYear.disabled = state.year <= MIN_YEAR;
    el.nextYear.disabled = state.year >= maxYear();

    renderHeatmap();
    renderLegend();
    el.emptyState.hidden = n > 0;
    el.emptyTitle.textContent = t('trends.emptyTitle', { y: state.year });
    el.emptyEmoji.textContent = m.icon;
    renderGoalCard();
    renderChart();
    renderStats();
    if (opts && opts.scroll) {
      scrollToRelevant();
      var at = el.metricTabs.querySelector('.active');
      if (at) el.metricTabs.scrollLeft = Math.max(0, at.offsetLeft - 18);
    }
  }

  function renderHeatmap() {
    var id = state.metric, y = state.year;
    var jan1 = new Date(y, 0, 1), dec31 = new Date(y, 11, 31);
    var start = addDays(jan1, -((jan1.getDay() + 6) % 7));
    var end = addDays(dec31, 6 - ((dec31.getDay() + 6) % 7));
    var total = dayDiff(start, end) + 1, weeks = total / 7;
    var tDate = today(), tKey = toKey(tDate);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < total; i++) {
      var d = addDays(start, i);
      var b = document.createElement('button');
      b.type = 'button';
      if (d.getFullYear() !== y) { b.className = 'cell out'; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); }
      else { var k = toKey(d); b.dataset.key = k; decorateCell(b, id, k, d > tDate, k === tKey); }
      frag.appendChild(b);
    }
    el.grid.innerHTML = '';
    el.grid.appendChild(frag);
    el.grid.setAttribute('aria-label', t('m.' + id) + ' ' + y);

    var months = t('months'), mf = document.createDocumentFragment(), lastCol = -10;
    for (var mo = 0; mo < 12; mo++) {
      var col = Math.floor(dayDiff(start, new Date(y, mo, 1)) / 7);
      if (mo > 0 && col - lastCol < 3) col = lastCol + 3;
      if (col >= weeks) col = weeks - 1;
      mf.appendChild(h('span', { text: months[mo], style: 'grid-column:' + (col + 1) + ' / span 1' }));
      lastCol = col;
    }
    el.months.innerHTML = '';
    el.months.style.gridTemplateColumns = 'repeat(' + weeks + ', var(--cell))';
    el.months.appendChild(mf);

    var wd = t('weekdays');
    el.dayLabels.innerHTML = '';
    for (var r = 0; r < 7; r++) el.dayLabels.appendChild(h('span', { text: r % 2 === 0 ? wd[r] : '' }));
  }

  function decorateCell(b, id, k, isFuture, isToday) {
    b.className = 'cell';
    b.disabled = false;
    var label = cap(fmtShort(k));
    if (isFuture) { b.classList.add('future'); b.disabled = true; }
    if (isToday) b.classList.add('today');
    var v = get(id, k);
    if (v !== null) {
      b.classList.add('has');
      b.style.setProperty('--c', color(id, v));
      label += ' · ' + fmtVal(id, v, true);
    } else {
      b.style.removeProperty('--c');
      label += ' · ' + t('u.nodata');
    }
    if (!el.logSheet.hidden && state.sheet.id === id && state.sheet.key === k) b.classList.add('selected');
    b.title = label;
    b.setAttribute('aria-label', label);
  }

  function refreshCell(id, k) {
    if (state.view !== 'trends' || state.metric !== id || !k) return;
    var b = el.grid.querySelector('[data-key="' + k + '"]');
    if (b) decorateCell(b, id, k, parseKey(k) > today(), k === todayKey());
  }

  function scrollToRelevant() {
    var sc = el.scroll;
    if (state.year === new Date().getFullYear()) {
      var tc = el.grid.querySelector('.today');
      if (tc) { sc.scrollLeft = Math.max(0, tc.offsetLeft + el.grid.offsetLeft - sc.clientWidth * 0.7); return; }
    }
    sc.scrollLeft = 0;
  }

  function renderLegend() {
    var id = state.metric, m = METRICS[id];
    el.legendTitle.textContent = t('legend.' + id);
    el.legendItems.innerHTML = '';
    m.legend().forEach(function (lbl, i) {
      el.legendItems.appendChild(h('li', null, [h('i', { class: 'dot', style: 'background:' + m.colors[i] }), lbl]));
    });
    el.legendItems.appendChild(h('li', null, [h('i', { class: 'dot empty' }), t('u.nodata')]));
  }

  function progressBlock(label, valueText, pct, colorCss) {
    var w = Math.max(0, Math.min(100, pct));
    return h('div', { class: 'progress-block' }, [
      h('div', { class: 'progress-row' }, [h('span', { text: label }), h('span', { text: valueText })]),
      h('div', { class: 'bar' }, [h('div', { class: 'bar-fill', style: 'width:' + w + '%' + (colorCss ? ';background:' + colorCss : '') })])
    ]);
  }

  function renderGoalCard() {
    var id = state.metric, m = METRICS[id];
    if (!m.goal) { el.goalCard.hidden = true; return; }
    el.goalCard.hidden = false;
    var g = settings.goals[id];
    el.goalTitle.textContent = id === 'weight' ? t('goal.weight') : t('goal.title');
    el.goalValue.textContent = g === null ? '—' : fmtVal(id, g, true);
    el.goalProgress.innerHTML = '';

    if (id === 'weight') {
      var lw = latestWeight();
      if (!lw || !g) { el.goalProgress.appendChild(h('p', { class: 'muted small', text: lw ? '—' : t('goal.noData') })); return; }
      var first = get('weight', keys('weight')[0]);
      var diff = lw.v - g, reached = Math.abs(diff) <= 0.5;
      var span = Math.abs(first - g) || 1;
      var pctW = reached ? 100 : Math.max(0, (1 - Math.abs(diff) / span) * 100);
      el.goalProgress.appendChild(progressBlock(
        t('stats.current') + ': ' + fmtVal('weight', lw.v, true),
        reached ? t('goal.reached') : t('goal.left', { v: fmtVal('weight', Math.abs(diff), true) }), pctW, GRAD));
      return;
    }

    var a7 = avg(lastN(id, 7));
    if (a7 === null) el.goalProgress.appendChild(progressBlock(t('goal.last7'), t('goal.noData'), 0));
    else {
      var p7 = Math.round(a7 / g * 100);
      el.goalProgress.appendChild(progressBlock(t('goal.last7'),
        fmtVal(id, a7, true) + ' / ' + fmtVal(id, g, true) + ' · ' + p7 + '%', p7, p7 >= 100 ? GRAD : color(id, a7)));
    }
    if (!isPro()) return;
    var ks = scopeKeys(id);
    var met = ks.filter(function (k) { return meetsGoal(id, get(id, k)); }).length;
    var pct = ks.length ? Math.round(met / ks.length * 100) : null;
    el.goalProgress.appendChild(progressBlock(
      t('goal.metScope', { s: state.scope === 'year' ? state.year : t('goal.allTime') }),
      pct === null ? '—' : t('goal.of', { a: met, b: ks.length }) + ' · ' + pct + '%', pct || 0, GRAD));
  }

  // ---------- charts ----------
  function renderChart() {
    var id = state.metric;
    el.chart.innerHTML = '';
    if (METRICS[id].chart === 'line') {
      el.chartTitle.textContent = t('chart.weight') + (isPro() ? '' : ' · ' + t('chart.last7').toLowerCase());
      lineChart();
      if (!isPro()) el.chart.appendChild(proLink('Вся история веса — в Про', 'stats'));
      return;
    }
    var free = !isPro();
    el.chartTitle.textContent = t(free ? 'chart.last7' : 'chart.last30');
    barChart(id, free ? 7 : 30);
    if (free) el.chart.appendChild(proLink('30 дней, год и всё время — в Про', 'stats'));
  }

  function barChart(id, nDays) {
    var m = METRICS[id], N = nDays || 30;
    var W = 320, H = 140, L = 30, B = 18, T = 8;
    var end = windowEnd(id), days = [];
    for (var i = N - 1; i >= 0; i--) days.push(addDays(end, -i));
    var vals = days.map(function (d) { return get(id, toKey(d)); });
    if (!vals.some(function (v) { return v !== null; })) {
      el.chart.appendChild(h('div', { class: 'chart-empty', text: t('chart.empty') }));
      return;
    }
    var g = goalOf(id);
    var maxV = m.isMood ? 5 : niceMax(Math.max.apply(null, vals.map(function (v) { return v || 0; }).concat([g || 0])) * 1.05);
    var ch = H - B - T, cw = W - L;
    var yv = function (v) { return T + ch - (v / maxV) * ch; };
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('chart.last30') });
    [0, 0.5, 1].forEach(function (f) {
      var v = maxV * f, lbl;
      if (m.isMood) lbl = f === 0 ? '' : m.emojis[Math.round(v) - 1] || '';
      else if (id === 'steps' || id === 'water') lbl = kfmt(v);
      else lbl = fmtNum(v, 1);
      svg.appendChild(svgEl('line', { class: 'grid-line', x1: L, x2: W, y1: yv(v), y2: yv(v) }));
      svg.appendChild(svgEl('text', { class: 'axis', x: L - 5, y: yv(v) + 3, 'text-anchor': 'end' }, lbl));
    });
    var bw = cw / N;
    vals.forEach(function (v, i) {
      var x = L + i * bw + bw * 0.18, w = bw * 0.64;
      if (v === null) {
        svg.appendChild(svgEl('rect', { x: x, y: yv(0) - 2, width: w, height: 2, rx: 1, fill: 'rgba(167,139,250,.18)' }));
      } else {
        var hgt = Math.max(2, yv(0) - yv(v));
        var r = svgEl('rect', { x: x, y: yv(0) - hgt, width: w, height: hgt, rx: Math.min(w / 2, 3), fill: color(id, v) });
        r.appendChild(svgEl('title', {}, cap(fmtShort(toKey(days[i]))) + ' · ' + fmtVal(id, v, true)));
        svg.appendChild(r);
      }
      if (N <= 7 || i % 7 === 1) {
        svg.appendChild(svgEl('text', { class: 'axis', x: x + w / 2, y: H - 4, 'text-anchor': 'middle' },
          days[i].getDate() + '.' + pad(days[i].getMonth() + 1)));
      }
    });
    if (g) svg.appendChild(svgEl('line', { class: 'goal-line', x1: L, x2: W, y1: yv(g), y2: yv(g) }));
    el.chart.appendChild(svg);
  }

  function lineChart() {
    var ks = scopeKeys('weight');
    if (!isPro()) { var from7 = toKey(addDays(today(), -6)); ks = keys('weight').filter(function (k) { return k >= from7; }); }
    if (ks.length < 2) { el.chart.appendChild(h('div', { class: 'chart-empty', text: t('chart.empty') })); return; }
    var W = 320, H = 150, L = 34, B = 18, T = 10;
    var vals = ks.map(function (k) { return get('weight', k); });
    var g = settings.goals.weight;
    var all = g ? vals.concat([g]) : vals;
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var padV = Math.max(0.5, (hi - lo) * 0.12);
    lo = Math.floor(lo - padV); hi = Math.ceil(hi + padV);
    var t0 = parseKey(ks[0]), span = Math.max(1, dayDiff(t0, parseKey(ks[ks.length - 1])));
    var xv = function (k) { return L + (dayDiff(t0, parseKey(k)) / span) * (W - L - 6); };
    var yv = function (v) { return T + (H - B - T) * (1 - (v - lo) / (hi - lo)); };
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('chart.weight') });
    var ldefs = svgEl('defs'), llg = svgEl('linearGradient', { id: 'htLineGrad', x1: '0', y1: '0', x2: '1', y2: '0' });
    llg.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#8b5cf6' }));
    llg.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#60a5fa' }));
    ldefs.appendChild(llg); svg.appendChild(ldefs);
    [lo, (lo + hi) / 2, hi].forEach(function (v) {
      svg.appendChild(svgEl('line', { class: 'grid-line', x1: L, x2: W, y1: yv(v), y2: yv(v) }));
      svg.appendChild(svgEl('text', { class: 'axis', x: L - 5, y: yv(v) + 3, 'text-anchor': 'end' }, fmtNum(v, 1)));
    });
    if (g) svg.appendChild(svgEl('line', { class: 'goal-line', x1: L, x2: W, y1: yv(g), y2: yv(g) }));
    // raw readings (faint) + 7-reading moving average (bold)
    var smooth = vals.map(function (v, i) { return avg(vals.slice(Math.max(0, i - 6), i + 1)); });
    var path = function (arr) {
      return ks.map(function (k, i) { return (i ? 'L' : 'M') + xv(k).toFixed(1) + ' ' + yv(arr[i]).toFixed(1); }).join(' ');
    };
    svg.appendChild(svgEl('path', { d: path(vals), fill: 'none', stroke: '#a78bfa', 'stroke-opacity': '.28', 'stroke-width': 1.2 }));
    svg.appendChild(svgEl('path', { d: path(smooth), fill: 'none', stroke: 'url(#htLineGrad)', 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    svg.appendChild(svgEl('circle', { cx: xv(ks[ks.length - 1]), cy: yv(vals[vals.length - 1]), r: 4, fill: '#c4b5fd', stroke: '#8b5cf6', 'stroke-width': 2 }));
    var months = t('months'), seen = {}, lastX = -100;
    ks.forEach(function (k) {
      var d = parseKey(k), mk = d.getFullYear() + '-' + d.getMonth(), x = xv(k);
      if (!seen[mk] && x - lastX > 22) {
        seen[mk] = 1; lastX = x;
        svg.appendChild(svgEl('text', { class: 'axis', x: x, y: H - 4, 'text-anchor': 'middle' }, months[d.getMonth()]));
      }
    });
    el.chart.appendChild(svg);
  }

  // ---------- stats ----------
  function stat(label, value, unitTxt) {
    var v = h('div', { class: 'stat-val' });
    if (value === null || value === undefined) v.textContent = '—';
    else { v.appendChild(document.createTextNode(value)); if (unitTxt) v.appendChild(h('small', { text: unitTxt })); }
    return h('div', { class: 'stat' }, [v, h('div', { class: 'stat-lbl', text: label })]);
  }
  function streakStat(label, n, id) {
    return stat(label, fmtNum(n, 0), ' ' + pluralWord(n, METRICS[id].night ? 'w.night' : 'w.day'));
  }

  // v9.1: wake-time regularity (SD of the wake time over the last 14 nights that have times)
  function regularityStat() {
    var r = window.V9Sleep ? window.V9Sleep.regularity(14) : null;
    var n = stat(r && r.sd !== null ? 'Регулярность · подъём, ' + window.V9Sleep.regWord(r.sd) : 'Регулярность · нужно 5 ночей со временем отбоя/подъёма', r && r.sd !== null ? '±' + r.sd : null, ' мин');
    n.classList.add('stat-reg');
    return n;
  }
  function renderStatsFree() {
    var id = state.metric, m = METRICS[id], from7 = toKey(addDays(today(), -6));
    var ks = keys(id).filter(function (k) { return k >= from7; }), vals = ks.map(function (k) { return get(id, k); });
    var u = id === 'steps' ? '' : ' ' + unit(id), out = [];
    var a = avg(vals);
    if (id === 'mood') out.push(stat(t('stats.avg') + ' · 7', a === null ? null : m.emojis[m.bucket(a)] + ' ' + fmtNum(a, 1)));
    else out.push(stat(t('stats.avg') + ' · 7', a === null ? null : fmtNum(a, id === 'weight' ? 1 : m.frac), u));
    out.push(stat(t('stats.logged') + ' · 7', fmtNum(vals.length, 0)));
    if (m.goal && id !== 'weight') {
      var met = vals.filter(function (v) { return meetsGoal(id, v); }).length;
      out.push(stat(t('stats.goalMet'), vals.length ? String(Math.round(met / vals.length * 100)) : null, '%'));
    } else if (id === 'weight') {
      out.push(stat(t('stats.min'), vals.length ? fmtNum(Math.min.apply(null, vals), 1) : null, u));
    } else {
      out.push(stat(t('stats.goodDays'), vals.length ? String(Math.round(vals.filter(function (v) { return v >= 4; }).length / vals.length * 100)) : null, '%'));
    }
    out.push(streakStat(t('stats.streak'), currentStreak(id), id));   // v9: the current streak is free
    if (id === 'sleep') out.push(regularityStat());
    el.stats.innerHTML = '';
    out.forEach(function (n) { el.stats.appendChild(n); });
    var lock = h('div', { class: 'stats-lock' });
    lock.innerHTML = '<div><b>' + (settings.lang === 'en' ? 'Year, all time, records & streaks' : 'Год, всё время, рекорды и лучшая серия') + ' ' + proBadge() + '</b><small>' +
      (settings.lang === 'en' ? 'The free version shows the last 7 days.' : 'В бесплатной версии — статистика за последние 7 дней.') + '</small></div>' +
      '<a class="btn small primary" href="#buy/stats">' + (settings.lang === 'en' ? 'Unlock' : 'Открыть') + '</a>';
    el.stats.appendChild(lock);
  }

  function renderStats() {
    var id = state.metric, m = METRICS[id];
    var free = !isPro();
    el.scopeYear.parentNode.hidden = free;
    el.stats.classList.toggle('stats-free', free);
    if (free) { renderStatsFree(); return; }
    el.scopeYear.textContent = String(state.year);
    el.scopeYear.classList.toggle('active', state.scope === 'year');
    el.scopeAll.classList.toggle('active', state.scope === 'all');
    el.scopeYear.setAttribute('aria-selected', String(state.scope === 'year'));
    el.scopeAll.setAttribute('aria-selected', String(state.scope === 'all'));
    var ks = scopeKeys(id);
    var vals = ks.map(function (k) { return get(id, k); });
    var u = id === 'steps' ? '' : ' ' + unit(id);
    var out = [];

    if (id === 'weight') {
      var lw = latestWeight(), past = weightOnOrBefore(30);
      var ch = lw && past !== null && keys('weight').length > 1 ? lw.v - past : null;
      out.push(stat(t('stats.current'), lw ? fmtNum(lw.v, 1) : null, u));
      out.push(stat(t('stats.change30'), ch === null ? null : signed(ch, 1), u));
      out.push(stat(t('stats.min'), vals.length ? fmtNum(Math.min.apply(null, vals), 1) : null, u));
      out.push(stat(t('stats.max'), vals.length ? fmtNum(Math.max.apply(null, vals), 1) : null, u));
      var bmi = lw && settings.height ? lw.v / Math.pow(settings.height / 100, 2) : null;
      out.push(stat(bmi === null && lw ? t('stats.bmi') + ' · ' + t('stats.bmiHint') : t('stats.bmi'), bmi === null ? null : fmtNum(bmi, 1)));
      var g = settings.goals.weight;
      out.push(stat(t('stats.toGoal'), lw && g ? signed(g - lw.v, 1) : null, u));
    } else if (id === 'mood') {
      var a = avg(vals), a30 = avg(lastN(id, 30));
      var good = vals.filter(function (v) { return v >= 4; }).length;
      out.push(stat(t('stats.avg'), a === null ? null : m.emojis[m.bucket(a)] + ' ' + fmtNum(a, 1)));
      out.push(stat(t('stats.avg30'), a30 === null ? null : m.emojis[m.bucket(a30)] + ' ' + fmtNum(a30, 1)));
      out.push(stat(t('stats.logged'), fmtNum(vals.length, 0)));
      out.push(stat(t('stats.goodDays'), vals.length ? String(Math.round(good / vals.length * 100)) : null, '%'));
      out.push(streakStat(t('stats.streak'), currentStreak(id), id));
      out.push(streakStat(t('stats.longest'), longestStreak(ks), id));
    } else {
      var av = avg(vals), av30 = avg(lastN(id, 30));
      var met = vals.filter(function (v) { return meetsGoal(id, v); }).length;
      out.push(stat(t('stats.avg'), av === null ? null : fmtNum(av, m.frac), u));
      out.push(stat(t('stats.avg30'), av30 === null ? null : fmtNum(av30, m.frac), u));
      out.push(stat(t('stats.logged'), fmtNum(vals.length, 0)));
      out.push(stat(t('stats.goalMet'), vals.length ? String(Math.round(met / vals.length * 100)) : null, '%'));
      out.push(streakStat(t('stats.streak'), currentStreak(id), id));
      out.push(streakStat(t('stats.longest'), longestStreak(ks), id));
      if (id === 'sleep') out.push(regularityStat());
    }
    el.stats.innerHTML = '';
    out.forEach(function (n) { el.stats.appendChild(n); });
  }

  // ======================================================================
  // PROFILE view
  // ======================================================================
  function renderProfile() {
    document.querySelectorAll('[data-lang]').forEach(function (b) { b.classList.toggle('active', b.dataset.lang === settings.lang); });
    if (document.activeElement !== el.heightInput) el.heightInput.value = settings.height || '';
    if (document.activeElement !== el.ageInput) el.ageInput.value = settings.age || '';
    sexButtons(el.profileSex, true);
    var bn = document.getElementById('v9BackupNote');
    if (bn && window.V9) bn.textContent = window.V9.backupNote();
    if (window.V9Body) window.V9Body.profileHook();
    if (window.V9Remind) window.V9Remind.renderSettings();
    el.goalsList.innerHTML = '';
    // v9: every metric can be switched off (it then leaves the ring, the week grid and «Сегодня»)
    ORDER.forEach(function (id) {
      var m = METRICS[id], on = metricOn(id);
      var g = settings.goals[id];
      el.goalsList.appendChild(h('div', { class: 'goal-row v9-goal-row' + (on ? '' : ' off') }, [
        h('button', { type: 'button', class: 'v9-switch', role: 'switch', 'aria-checked': String(on), 'data-v9': 'goal-on', 'data-id': id,
          'aria-label': (on ? 'Выключить: ' : 'Включить: ') + t('m.' + id) }, [h('i')]),
        h('span', { class: 'row-lbl' }, [m.icon + ' ' + (id === 'weight' ? t('goal.weight') : t('m.' + id))]),
        m.goal && on ? h('div', { class: 'stepper' }, [
          h('button', { type: 'button', class: 'step-btn', 'data-goal': id, 'data-dir': -1, 'aria-label': '−', text: '−' }),
          h('output', { class: 'step-val', text: g === null ? '—' : fmtVal(id, g, true) }),
          h('button', { type: 'button', class: 'step-btn', 'data-goal': id, 'data-dir': 1, 'aria-label': '+', text: '+' })
        ]) : h('span', { class: 'muted small', text: on ? 'отслеживать' : 'выключено' })
      ]));
    });
  }

  function changeGoal(id, dir) {
    var gm = METRICS[id].goal, g = settings.goals[id];
    if (g === null) { var lw = latestWeight(); g = lw ? Math.round(lw.v * 2) / 2 : 70; }
    else g = g + dir * gm.step;
    settings.goals[id] = Math.round(Math.max(gm.min, Math.min(gm.max, g)) * 100) / 100;
    persist();
  }

  // ======================================================================
  // Static i18n, routing
  // ======================================================================
  function applyStaticI18n() {
    document.documentElement.lang = settings.lang;
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(function (n) { n.innerHTML = t(n.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (n) { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (n) { n.setAttribute('placeholder', t(n.dataset.i18nPh)); });
    document.title = settings.lang === 'ru' ? 'Здоровье' : 'Health';
  }

  function parseHash() {
    var parts = (location.hash || '').replace(/^#/, '').split('/');
    if (parts[0] === 'chat') parts[0] = 'food';   // old links / home-screen shortcuts
    var view = ['today', 'trends', 'food', 'workouts', 'profile', 'jaw', 'skin', 'buy', 'ai', 'history', 'week', 'body'].indexOf(parts[0]) >= 0 ? parts[0] : 'today';
    state.sub = parts.slice(1);
    if (view === 'trends' && METRICS[parts[1]]) state.metric = parts[1];
    return view;
  }
  function go(view, metric) {
    var target = '#' + view + (view === 'trends' ? '/' + (metric || state.metric) : '');
    if (location.hash !== target) location.hash = target; else route();
  }
  function route() {
    var prevView = state.view, prevMetric = state.metric;
    state.view = parseHash();
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.dataset.view !== state.view; });
    // v9: «Лицо» left the tab bar — face sections, weekly summary and the AI live under «Сегодня»
    var navView = (state.view === 'workouts' || state.view === 'history') ? 'food' : (state.view === 'jaw' || state.view === 'skin' || state.view === 'week' || state.view === 'ai') ? 'today' : (state.view === 'buy' || state.view === 'body') ? 'profile' : state.view;
    if (window.V9) window.V9.markSeen(state.view);
    if (state.view !== 'jaw' && window.JawModule) window.JawModule.leave();   // v5: stop a running jaw workout timer
    document.querySelectorAll('.tab[data-tab]').forEach(function (tb) {
      tb.classList.toggle('active', tb.dataset.tab === navView);
      if (tb.dataset.tab === 'trends') tb.setAttribute('href', '#trends/' + state.metric);
    });
    var changed = prevView !== state.view || prevMetric !== state.metric;
    render({ scroll: changed });
    if (prevView !== state.view) window.scrollTo(0, 0);
  }
  function render(opts) {
    if (state.view === 'today') renderToday();
    else if (state.view === 'trends') renderTrends(opts);
    else if (state.view === 'food') renderFood();
    else if (state.view === 'workouts') renderWorkouts(opts);
    else if (state.view === 'jaw') { if (window.JawModule) window.JawModule.render(); }
    else if (state.view === 'skin') { if (window.SkinModule) window.SkinModule.render(); }
    else if (state.view === 'buy') { if (window.HTPro) window.HTPro.renderBuy(); }
    else if (state.view === 'ai') { if (window.AIModule) window.AIModule.render(); }
    else if (state.view === 'history') { if (window.HistoryModule) window.HistoryModule.render(state.sub || []); }
    else if (state.view === 'week') { if (window.V9) window.V9.renderWeek(); }
    else if (state.view === 'body') { if (window.V9Body) window.V9Body.render(); }
    else { renderProfile(); if (window.HTPro) window.HTPro.renderProfileCard(); }
    if (state.view === 'today') renderFacePromos();
    if (state.view === 'today' || state.view === 'workouts') {
      var lb = document.getElementById(state.view === 'today' ? 'hsLiveToday' : 'hsLiveWk');
      if (lb) lb.innerHTML = window.HistoryModule ? window.HistoryModule.liveBanner() : '';
    }
  }
  // v5: subtitles of the «Челюсть 30 дней» / «Уход за кожей» shortcuts on the Today screen
  function renderFacePromos() {
    try {
      var j = document.getElementById('jawPromoSub'), k = document.getElementById('skinPromoSub');
      if (j && window.JawModule) j.textContent = window.JawModule.summary();
      if (k && window.SkinModule) k.textContent = window.SkinModule.summary();
    } catch (e) { /* ignore */ }
  }

  // ======================================================================
  // Sheets
  // ======================================================================
  function showSheet(sheet) {
    [el.addSheet, el.logSheet].forEach(function (s) { s.hidden = s !== sheet; });
    el.backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeSheets() {
    var s = state.sheet;
    el.addSheet.hidden = true; el.logSheet.hidden = true; el.backdrop.hidden = true;
    document.body.style.overflow = '';
    state.sheet = { id: null, key: null, value: null };
    if (s.id) refreshCell(s.id, s.key);
  }

  function openAdd() {
    el.addGrid.innerHTML = '';
    ORDER.forEach(function (id) {
      el.addGrid.appendChild(h('button', { type: 'button', class: 'add-item', 'data-add': id }, [h('i', { text: METRICS[id].icon }), t('m.' + id)]));
    });
    showSheet(el.addSheet);
  }

  function openLog(id, k) {
    var m = METRICS[id];
    k = k || defaultKey(id);
    state.sheet = { id: id, key: k, value: null };
    el.sheetKicker.textContent = m.icon + ' ' + t('m.' + id);
    el.dateLbl.textContent = m.night ? t('sheet.nightOf') : t('sheet.date');
    el.dateInput.max = todayKey();
    el.dateInput.value = k;
    el.numericInput.hidden = !!m.isMood;
    el.moodInput.hidden = !m.isMood;

    if (m.isMood) {
      el.moodInput.innerHTML = '';
      m.emojis.forEach(function (e, i) {
        el.moodInput.appendChild(h('button', { type: 'button', 'data-mood-pick': i + 1 }, [e, h('span', { text: t('mood.' + (i + 1)) })]));
      });
    } else {
      var lo = m.sliderMin || m.min;
      el.valRange.min = lo; el.valRange.max = m.sliderMax; el.valRange.step = m.step;
      el.valUnit.textContent = id === 'steps' ? '' : unit(id);
      el.valInput.parentNode.classList.toggle('wide', id === 'steps' || id === 'water');
      el.rangeScale.innerHTML = '';
      for (var i = 0; i <= 4; i++) {
        var sv = lo + (m.sliderMax - lo) * i / 4;
        el.rangeScale.appendChild(h('span', { text: id === 'steps' || id === 'water' ? kfmt(sv) : fmtNum(sv, 0) }));
      }
      el.chips.innerHTML = '';
      m.chips.forEach(function (c) {
        var add = typeof c === 'string';
        el.chips.appendChild(h('button', { type: 'button', class: 'chip', 'data-chip': c,
          text: add ? c : id === 'steps' ? kfmt(c) : fmtVal(id, c, id === 'water' ? 'short' : true) }));
      });
      el.chips.hidden = !m.chips.length;
    }
    loadSheetValue();
    showSheet(el.logSheet);
    refreshCell(id, k);
  }

  function loadSheetValue() {
    var id = state.sheet.id, k = state.sheet.key, m = METRICS[id];
    var v = get(id, k);
    if (v === null) {
      if (id === 'weight') { var lw = latestWeight(); v = lw ? lw.v : m.defVal(); }
      else if (id === 'sleep') { var ks = keys(id); v = ks.length ? get(id, ks[ks.length - 1]) : settings.goals.sleep; }
      else v = m.isMood ? null : m.defVal(goalOf(id));
    }
    setSheetValue(v);
    updateSheetMeta();
    if (window.V9Sleep) window.V9Sleep.onSheet(id, k);   // v9.1: bedtime / wake time for sleep
  }

  function setSheetValue(v, fromTyping) {
    var id = state.sheet.id, m = METRICS[id];
    if (m.isMood) {
      state.sheet.value = v;
      el.moodInput.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', Number(b.dataset.moodPick) === v); });
      return;
    }
    v = Math.max(m.min, Math.min(m.max, v));
    if (!fromTyping) v = Math.round(v / m.step) * m.step;
    v = Math.round(v * 100) / 100;
    state.sheet.value = v;
    if (!fromTyping) el.valInput.value = fmtNum(v, m.frac).replace(/[\s\u00a0\u202f,]/g, function (c) { return c === ',' && settings.lang === 'ru' ? ',' : ''; });
    el.valRange.value = v;
    var lo = m.sliderMin || m.min;
    var fill = Math.max(0, Math.min(100, (v - lo) / (m.sliderMax - lo) * 100));
    var col = color(id, v);
    el.valRange.style.setProperty('--fill', fill + '%');
    el.valRange.style.setProperty('--thumb', col);
    el.valInput.parentNode.style.color = col;
    el.chips.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', Number(c.dataset.chip) === v); });
  }

  function parseInputNumber(s) {
    s = String(s).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }

  function updateSheetMeta() {
    var id = state.sheet.id, k = state.sheet.key, m = METRICS[id];
    el.sheetTitle.textContent = dayName(id, k);
    el.sheetCurrent.innerHTML = '';
    var v = get(id, k);
    var dot = h('i', { class: 'dot' });
    if (v !== null) dot.style.background = color(id, v);
    var txt = v === null ? t('sheet.noData') : t('sheet.logged', { v: fmtVal(id, v, true) + (m.isMood ? ' ' + t('mood.' + v) : '') });
    el.sheetCurrent.appendChild(dot);
    el.sheetCurrent.appendChild(h('span', { text: cap(fmtLong(k)) + ' · ' + txt }));
    el.clearEntryBtn.hidden = v === null;
    el.saveBtn.textContent = v === null ? t('sheet.save') : t('sheet.update');
  }

  function saveSheet() {
    var s = state.sheet, m = METRICS[s.id];
    if (!s.id || !isValidKey(s.key)) return;
    if (parseKey(s.key) > today()) { toast(t('sheet.future')); return; }
    var v = s.value;
    if (!m.isMood) {
      var typed = parseInputNumber(el.valInput.value);
      if (!isFinite(typed) || typed < m.min || typed > m.max) {
        toast(t('sheet.invalid', { min: fmtNum(m.min), max: fmtNum(m.max) }));
        return;
      }
      v = Math.round(typed * 100) / 100;
    } else if (!v) { toast(t('sheet.pickMood')); return; }
    var id = s.id, k = s.key;
    store.data[id][k] = v;
    persist();
    if (id === 'sleep' && window.V9Sleep) window.V9Sleep.onSave(k, v);
    closeSheets();
    if (state.view === 'trends' && state.metric === id) state.year = +k.slice(0, 4);
    render();
    toast(t('sheet.saved', { v: fmtVal(id, v, true) }));
  }

  function clearEntry() {
    var s = state.sheet;
    if (!s.id || !has(s.id, s.key)) return;
    delete store.data[s.id][s.key];
    persist();
    if (s.id === 'sleep' && window.V9Sleep) window.V9Sleep.onClear(s.key);
    closeSheets();
    render();
    toast(t('sheet.cleared'));
  }

  // ======================================================================
  // Data: export / import / demo / clear
  // ======================================================================
  function download(filename, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function needPro(from) {
    if (isPro()) return false;
    toast(settings.lang === 'en' ? 'CSV export is a Pro feature (the JSON backup is free)' : 'Таблица CSV — в Про. Резервная копия JSON бесплатна');
    location.hash = '#buy/' + from;
    return true;
  }
  // v9: the JSON backup is free (CSV, year charts and AI stay in Pro). opts.photos → include progress photos.
  function exportJSON(opts) {
    var data = {};
    ORDER.forEach(function (id) { data[id] = {}; keys(id).forEach(function (k) { data[id][k] = get(id, k); }); });
    var payload = { app: 'health-tracker', version: 2, exportedAt: new Date().toISOString(), settings: settings, data: data, food: food,
      plan: { form: planStore.form, plan: planStore.plan, at: planStore.at },
      history: window.HistoryModule ? window.HistoryModule.exportData() : undefined,
      modules: { jaw: readJSON('health.jaw.v1', null), skin: readJSON('health.skin.v1', null) },
      userId: window.HTPro && window.HTPro.userId ? window.HTPro.userId() : undefined };
    var V = window.V9;
    Promise.resolve(V ? V.exportAll(opts || {}) : undefined).then(function (v9) {
      if (v9) payload.v9 = v9;
      download('health-data-' + todayKey() + (opts && opts.photos ? '-photos' : '') + '.json', JSON.stringify(payload, null, opts && opts.photos ? 0 : 2), 'application/json');
      if (V) V.backupDone();
      toast(t('data.downloaded'));
      if (state.view === 'today' || state.view === 'profile') render();
    });
  }
  function exportCSV() {
    if (needPro('export')) return;
    var byDate = {};
    ORDER.forEach(function (id) { keys(id).forEach(function (k) { (byDate[k] = byDate[k] || {})[id] = get(id, k); }); });
    var rows = ['date,' + ORDER.join(',')];
    Object.keys(byDate).sort().forEach(function (k) {
      rows.push(k + ',' + ORDER.map(function (id) { return byDate[k][id] !== undefined ? byDate[k][id] : ''; }).join(','));
    });
    download('health-data-' + todayKey() + '.csv', rows.join('\n') + '\n', 'text/csv');
    toast(t('data.csvDone'));
  }
  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(String(reader.result)); } catch (e) { toast(t('data.invalidJson')); return; }
      if (!obj || typeof obj !== 'object') { toast(t('data.noValid')); return; }
      var incoming = emptyData();
      if (obj.data && typeof obj.data === 'object') {          // v2 export
        ORDER.forEach(function (id) { incoming[id] = sanitizeMap(id, obj.data[id]); });
      } else if (obj.entries) {                                // v1 sleep export
        incoming.sleep = sanitizeMap('sleep', obj.entries);
      } else {                                                 // plain {date: hours} → sleep
        incoming.sleep = sanitizeMap('sleep', obj);
      }
      var inFood = sanitizeFood(obj.food);
      var nFood = foodCount(inFood);
      var nHist = obj.history && Array.isArray(obj.history.workouts) ? obj.history.workouts.length : 0;
      var nV9 = window.V9 && obj.v9 ? window.V9.countAll(obj.v9) : 0;   // v9: sleep times, measurements, favourites, photos
      var n = ORDER.reduce(function (s, id) { return s + Object.keys(incoming[id]).length; }, 0) + nFood + nHist + nV9;
      var HP = window.HTPro, idNew = typeof obj.userId === 'string' && HP && HP.validId && HP.validId(obj.userId) && obj.userId !== HP.userId() ? obj.userId : null;
      var askId = function () { return idNew && confirm('Восстановить твой ID из копии: ' + idNew + '? (сейчас на этом устройстве ' + HP.userId() + '). Ключи, привязанные к ID из копии, снова заработают.'); };
      if (!n) {
        if (idNew) { if (askId()) { HP.setUserId(idNew); toast('ID восстановлен: ' + idNew); } return; }
        toast(t('data.noValid')); return;
      }
      if (!confirm(t('data.confirmImport', { n: plural(n, 'w.entry') }))) return;
      ORDER.forEach(function (id) { Object.keys(incoming[id]).forEach(function (k) { store.data[id][k] = incoming[id][k]; }); });
      if (nFood) { Object.keys(inFood).forEach(function (k) { food[k] = inFood[k]; }); saveFood(); }
      if (nHist && window.HistoryModule) window.HistoryModule.importData(obj.history);
      if (window.V9 && obj.v9) window.V9.importAll(obj.v9);
      // v8.1: personal ID (keys can be bound to it) — restored from the backup, e.g. after reinstalling the app
      if (askId()) HP.setUserId(idNew);
      // jaw / skincare progress: only restored on a device that has none yet (never overwrites local progress)
      if (obj.modules && typeof obj.modules === 'object') {
        var jw = obj.modules.jaw, sk = obj.modules.skin, lj = readJSON('health.jaw.v1', null), ls = readJSON('health.skin.v1', null);
        if (jw && jw.completed && typeof jw.completed === 'object' && !(lj && lj.completed && Object.keys(lj.completed).length)) writeJSON('health.jaw.v1', jw);
        if (sk && sk.checks && typeof sk.checks === 'object' && !(ls && ls.checks && Object.keys(ls.checks).length)) writeJSON('health.skin.v1', sk);
      }
      if (obj.plan && typeof obj.plan === 'object') {
        var ps = sanitizePlanStore(obj.plan);
        if (ps.plan) { planStore = ps; wk.form = ps.form; savePlanStore(); }
      }
      if (obj.settings && obj.settings.goals) {
        var s2 = sanitizeSettings(obj.settings);
        settings.goals = s2.goals;
        if (s2.height) settings.height = s2.height;
        if (s2.age) settings.age = s2.age;
        if (s2.sex) settings.sex = s2.sex;
        if (obj.settings.activity) settings.activity = s2.activity;
        if (s2.kcal) settings.kcal = s2.kcal;
      } else if (obj.settings && isFinite(Number(obj.settings.goal))) {
        var g = Number(obj.settings.goal);
        if (g >= 4 && g <= 12) settings.goals.sleep = g;
      }
      persist();
      render({ scroll: true });
      toast(t('data.imported', { n: plural(n, 'w.entry') }));
    };
    reader.onerror = function () { toast(t('data.readError')); };
    reader.readAsText(file);
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function loadDemo() {
    var t0 = today(), y = t0.getFullYear(), tk = todayKey();
    var rnd = mulberry32(y * 7919);
    var gauss = function () { return (rnd() + rnd() + rnd() + rnd() - 2) * 1.7; };
    var added = 0;
    var put = function (id, k, v) { if (!has(id, k)) { store.data[id][k] = Math.round(v * 100) / 100; added++; } };
    var weight = 82 + rnd() * 4;
    for (var d = new Date(y - 1, 0, 1); d <= t0; d = addDays(d, 1)) {
      var k = toKey(d), dow = d.getDay(), weekend = dow === 0 || dow === 6, isToday = k === tk;
      var hrs = 7.3 + ((dow === 5 || dow === 6) ? 0.8 : 0) + gauss() * 0.9;
      if (!isToday && rnd() < 0.9) put('sleep', k, Math.max(4, Math.min(11, Math.round(hrs * 2) / 2)));
      if (rnd() < 0.8) put('water', k, Math.max(250, Math.min(4000, Math.round((1900 + gauss() * 450) / 250) * 250 * (isToday ? 0.5 : 1))));
      if (rnd() < 0.85) put('steps', k, Math.max(800, Math.round(((weekend ? 11000 : 8000) + gauss() * 2600) * (isToday ? 0.6 : 1))));
      if (rnd() < (weekend ? 0.6 : 0.4)) put('workout', k, Math.max(10, Math.round((35 + gauss() * 18) / 5) * 5));
      weight += -0.012 + gauss() * 0.08;
      if (rnd() < 0.45) put('weight', k, Math.round((weight + gauss() * 0.25) * 10) / 10);
      if (rnd() < 0.75) put('mood', k, Math.max(1, Math.min(5, Math.round(3.7 + gauss() * 0.8))));
    }
    if (!settings.goals.weight) settings.goals.weight = Math.round(weight - 4);
    if (window.HistoryModule) added += window.HistoryModule.demo();
    persist();
    state.year = y;
    render({ scroll: true });
    toast(added ? t('data.demoAdded', { n: fmtNum(added, 0) }) : t('data.demoNone'));
  }
  // v9.4: «Удалить все данные» wipes every record store (incl. v9 stores and photos) but keeps the profile,
  // goals, Pro key / trial, personal ID and the AI connection settings. The page reloads so no module keeps stale state.
  var CLEAR_KEYS = ['health.history.v1', 'health.sleeptimes.v1', 'health.jaw.v1', 'health.skin.v1', 'health.foodfav.v1',
    'health.barcode.v1', 'health.measure.v1'];
  function clearAll() {
    var extra = 0;
    CLEAR_KEYS.forEach(function (k) { try { if (localStorage.getItem(k)) extra++; } catch (e) { /* */ } });
    var n = totalEntries() + foodCount(food) + (window.HistoryModule ? window.HistoryModule.count() : 0);
    if (!n && !extra) { toast(t('data.nothing')); return; }
    if (!confirm(t('data.confirmClear', { n: fmtNum(n, 0) }) + ' Также удалятся время сна, челюсть, уход, избранное, штрихкоды, замеры, фото и история ИИ-чата. Профиль, цели и Про-ключ останутся.')) return;
    store.data = emptyData();
    food = {}; saveFood();
    planStore = sanitizePlanStore(null); wk.form = planStore.form;
    try {
      [PLAN_KEY, LEGACY_CHAT_KEY].concat(CLEAR_KEYS).forEach(function (k) { localStorage.removeItem(k); });
      // AI: drop the chat history and photo cards, keep the connection settings (key / model / server)
      var ai = JSON.parse(localStorage.getItem('health.ai.v1') || 'null');
      if (ai && typeof ai === 'object') { ai.msgs = []; ai.photos = {}; ai.ctx = {}; localStorage.setItem('health.ai.v1', JSON.stringify(ai)); }
      // v9 prefs: forget backup/weekly/measurement timestamps (settings like goals and reminders stay)
      var p9 = JSON.parse(localStorage.getItem('health.v9') || 'null');
      if (p9 && typeof p9 === 'object') { p9.backup = {}; p9.weekly = {}; p9.measure = {}; if (p9.remind) p9.remind.last = {}; localStorage.setItem('health.v9', JSON.stringify(p9)); }
    } catch (e) { /* ignore */ }
    fs.day = null; fs.sel = null;
    persist();
    if (window.AIModule && window.AIModule.wipe) window.AIModule.wipe();
    window.__htClearing = true;   // modules must not write their in-memory state back
    var done = function () { try { sessionStorage.setItem('ht-cleared', '1'); } catch (e) { /* */ } location.reload(); };
    var ph = window.V9Photos && window.V9Photos.clear ? window.V9Photos.clear() : Promise.resolve();
    ph.then(done, done);
  }

  // ======================================================================
  // v4: offline food diary (КБЖУ), energy calculator, rule-based workout
  //     programs and coach tips. Everything runs locally — no network, no keys.
  // ======================================================================
  var FOODS = window.HEALTH_FOODS || [];
  var FOOD_CATS = window.HEALTH_FOOD_CATS || {};
  var EXERCISES = window.HEALTH_EXERCISES || [];
  var COACH = window.HEALTH_COACH || { answers: [], tips: [] };
  var FOOD_BY_ID = {}; FOODS.forEach(function (f) { FOOD_BY_ID[f.id] = f; });
  var EX_BY_ID = {}; EXERCISES.forEach(function (x) { EX_BY_ID[x.id] = x; });

  var FOOD_KEY = 'health.food.v1', PLAN_KEY = 'health.plan.v1', LEGACY_CHAT_KEY = 'health.chat.v1';

  function readJSON(key, fallback) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function clampNum(v, lo, hi, nd) {
    v = Number(v);
    if (!isFinite(v)) return 0;
    var p = Math.pow(10, nd || 0);
    return Math.round(Math.max(lo, Math.min(hi, v)) * p) / p;
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function round50(v) { return Math.round(v / 50) * 50; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function icon(path) {
    var s = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    s.appendChild(svgEl('path', { d: path }));
    return s;
  }
  var ICON_X = 'M6 6l12 12M18 6L6 18', ICON_L = 'M15 5l-7 7 7 7', ICON_R = 'M9 5l7 7-7 7';

  // ---------- food diary storage ----------
  // health.food.v1 -> { "YYYY-MM-DD": [{ id, name, kcal, p, f, c, at, fid?, g? }] }
  function sanitizeFood(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    Object.keys(obj).forEach(function (k) {
      if (!isValidKey(k) || !Array.isArray(obj[k])) return;
      var list = obj[k].filter(function (x) { return x && typeof x === 'object'; }).slice(0, 100).map(function (x) {
        var e = {
          id: String(x.id || uid()).slice(0, 24), name: String(x.name || '').slice(0, 120),
          kcal: clampNum(x.kcal, 0, 10000, 0), p: clampNum(x.p, 0, 1000, 1), f: clampNum(x.f, 0, 1000, 1),
          c: clampNum(x.c, 0, 2000, 1), at: Number(x.at) || 0
        };
        if (typeof x.fid === 'string' && x.fid.length <= 40) e.fid = x.fid;
        var g = Number(x.g);
        if (x.g !== undefined && x.g !== null && isFinite(g) && g > 0 && g <= 5000) e.g = Math.round(g);
        // v9.2: optional fiber (only new entries have it) and the barcode the product came from
        var fb = Number(x.fib);
        if (x.fib !== undefined && x.fib !== null && x.fib !== '' && isFinite(fb) && fb >= 0 && fb <= 300) e.fib = Math.round(fb * 10) / 10;
        if (typeof x.bc === 'string' && /^\d{6,14}$/.test(x.bc)) e.bc = x.bc;
        return e;
      });
      if (list.length) out[k] = list;
    });
    return out;
  }
  function foodCount(f) { return Object.keys(f).reduce(function (n, k) { return n + f[k].length; }, 0); }
  var food = sanitizeFood(readJSON(FOOD_KEY, {}));
  function saveFood() { if (!writeJSON(FOOD_KEY, food)) toast(t('data.storageError')); }
  function foodTotals(k) {
    return (food[k] || []).reduce(function (a, x) { a.kcal += x.kcal; a.p += x.p; a.f += x.f; a.c += x.c; if (x.fib !== undefined) { a.fib = (a.fib || 0) + x.fib; } return a; },
      { kcal: 0, p: 0, f: 0, c: 0 });
  }
  function dbName(f) { return f[settings.lang] || f.ru; }
  function entryName(x) { var f = x.fid && FOOD_BY_ID[x.fid]; return f ? dbName(f) : (x.name || t('food.meal')); }
  function macroLine(p, f, c) {
    var g = t('kbju.g');
    return t('kbju.short', { p: fmtNum(p, 0) + g, f: fmtNum(f, 0) + g, c: fmtNum(c, 0) + g });
  }
  function portionOf(f, g) {
    var k = g / 100;
    return { kcal: Math.round(f.kcal * k), p: r1(f.p * k), f: r1(f.f * k), c: r1(f.c * k) };
  }

  // ---------- food search (local, accent/ё-insensitive, RU + EN + tags) ----------
  // v7: apostrophes / & / dashes are ignored; whole-word matches rank above in-word ones (печень → liver before печенье);
  //     if nothing is found, every long word is shortened by 1–2 letters and the search is retried (пельменей → пельмен…).
  function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/['’‘`ʼ]/g, '')
      .replace(/[«»"“”().,/+%&—–!?:;-]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  var FOOD_INDEX = FOODS.map(function (f) {
    var ru = norm(f.ru), en = norm(f.en), all = norm(f.ru + ' ' + f.en + ' ' + f.tags);
    return { f: f, ru: ru, en: en, all: all, ruW: ru.split(' '), enW: en.split(' '), allW: all.split(' ') };
  });
  function wordTier(w, nameW, nameStr, allW, allStr) {
    if (nameW.indexOf(w) >= 0) return 0;                                            // whole word in the name
    if (nameW.some(function (x) { return x.indexOf(w) === 0; })) return 1;          // a name word starts with it
    if (allW.indexOf(w) >= 0) return 2;                                             // whole word in tags / other language
    if (allW.some(function (x) { return x.indexOf(w) === 0; })) return 3;
    if (nameStr.indexOf(w) >= 0) return 4;                                          // inside a word
    return 5;
  }
  function searchPass(words, q) {
    var out = [], en = settings.lang === 'en';
    FOOD_INDEX.forEach(function (it) {
      if (!words.every(function (w) { return w.length < 2 ? it.allW.indexOf(w) >= 0 : it.all.indexOf(w) >= 0; })) return;
      var nm = en ? it.en : it.ru, nmW = en ? it.enW : it.ruW;
      var s = 0;
      words.forEach(function (w) { s += wordTier(w, nmW, nm, it.allW, it.all); });
      if (nmW[0] === words[0]) s -= 0.6;                     // first word of the name is exactly the first query word
      if (nm.indexOf(q) === 0) s -= 0.4;                     // name starts with the whole query
      out.push({ f: it.f, s: s });
    });
    out.sort(function (a, b) { return a.s - b.s || dbName(a.f).length - dbName(b.f).length; });
    return out;
  }
  function searchFoods(q, limit) {
    q = norm(q);
    if (!q) return [];
    var words = q.split(' ');
    var out = searchPass(words, q);
    for (var cut = 1; !out.length && cut <= 2; cut++) {
      var shorter = words.map(function (w) { return w.length - cut >= 4 ? w.slice(0, w.length - cut) : w; });
      if (shorter.join(' ') === words.join(' ')) continue;
      out = searchPass(shorter, shorter.join(' '));
    }
    return out.slice(0, limit || 8).map(function (o) { return o.f; });
  }
  var POPULAR = ['buckwheat_cooked', 'chicken_breast', 'egg', 'cottage_5', 'oatmeal_milk', 'banana', 'apple', 'bread_rye'];
  function recentFoods(n) {
    var out = [], seen = {}, ks = Object.keys(food).sort().reverse().slice(0, 30);
    ks.forEach(function (k) {
      food[k].slice().reverse().forEach(function (x) {
        var key = x.fid || ('n:' + x.name);
        if (seen[key] || out.length >= n) return;
        seen[key] = 1; out.push(x);
      });
    });
    return out;
  }

  // ---------- energy: BMR (Mifflin-St Jeor) → TDEE → calorie & macro targets ----------
  var ACTIVITY = { sed: 1.2, light: 1.375, mod: 1.55, high: 1.725, very: 1.9 };
  var ACT_ORDER = ['sed', 'light', 'mod', 'high', 'very'];
  var GOAL_ADJ = { fat_loss: -0.2, muscle: 0.1, general: 0 };
  var PROTEIN_PER_KG = { fat_loss: 2.0, muscle: 1.8, general: 1.6 };
  function calcEnergy(p) {
    if (!(p.age >= 10 && p.age <= 100 && p.weight >= 25 && p.weight <= 300 && p.height >= 100 && p.height <= 250)) return null;
    var sexAdj = p.sex === 'f' ? -161 : p.sex === 'm' ? 5 : -78;
    var bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + sexAdj;
    var factor = ACTIVITY[p.activity] || ACTIVITY.light;
    var tdee = bmr * factor;
    var goal = GOAL_ADJ[p.goal] !== undefined ? p.goal : 'general';
    var raw = tdee * (1 + GOAL_ADJ[goal]);
    var floor = Math.max(p.sex === 'f' ? 1200 : 1500, bmr);
    var target = round50(goal === 'fat_loss' ? Math.max(raw, floor) : raw);
    var hm = p.height / 100, bmi = p.weight / (hm * hm);
    var refW = bmi > 30 ? Math.round(27 * hm * hm) : p.weight;   // protein on a reference weight with obesity
    var protein = Math.round(refW * PROTEIN_PER_KG[goal]);
    var fat = Math.round(Math.max(0.8 * refW, target * 0.25 / 9));
    var carbs = Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));
    return {
      bmr: Math.round(bmr), tdee: Math.round(tdee), factor: factor, goal: goal, target: target,
      floorHit: goal === 'fat_loss' && raw < floor, floorV: round50(p.sex === 'f' ? 1200 : 1500),
      protein: protein, proteinLo: Math.round(refW * 1.6), proteinHi: Math.round(refW * 2.2),
      fat: fat, carbs: carbs, bmi: bmi, refW: refW, adjusted: bmi > 30, sexKnown: p.sex === 'm' || p.sex === 'f'
    };
  }
  function currentWeight() {
    var lw = latestWeight(), fw = wk.form.weight;
    if (fw && (!lw || (wk.form.weightKey && wk.form.weightKey >= lw.key))) return fw;
    return lw ? lw.v : fw;
  }
  function profileEnergy() {
    return calcEnergy({
      age: settings.age || wk.form.age, weight: currentWeight(), height: settings.height || wk.form.height,
      sex: settings.sex, activity: settings.activity, goal: wk.form.goal
    });
  }
  function kcalGoal() {
    var e = profileEnergy();
    if (settings.kcal) return { v: settings.kcal, auto: false, e: e };
    return e ? { v: e.target, auto: true, e: e } : { v: 2000, auto: true, def: true, e: null };
  }
  function macroTargets(g) {
    var e = g.e, kcal = g.v, p, f;
    if (e) { p = e.protein; f = Math.round(Math.max(0.8 * e.refW, kcal * 0.25 / 9)); }
    else { p = Math.round(kcal * 0.25 / 4); f = Math.round(kcal * 0.3 / 9); }
    if (p * 4 + f * 9 > kcal * 0.85) f = Math.max(0, Math.round((kcal * 0.85 - p * 4) / 9));
    return { p: p, f: f, c: Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4)) };
  }
  function energyWhy(e) {
    return 'BMR ' + fmtNum(e.bmr, 0) + ' × ' + fmtNum(e.factor, 3) + ' = ' + fmtNum(e.tdee, 0) + ', ' + t('en.adj.' + e.goal);
  }

  // ---------- food screen ----------
  var fs = { day: null, q: '', sel: null, mode: 'db', goalEdit: false, answer: null, tipsAll: false };
  function foodDay() { var tk = todayKey(); return fs.day && fs.day < tk ? fs.day : tk; }
  function dayLabel(k) {
    if (k === todayKey()) return t('food.today') + ', ' + parseKey(k).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
    if (k === yesterdayKey()) return t('day.yesterday') + ', ' + parseKey(k).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
    return cap(fmtShort(k));
  }
  function barRow(label, val, goal, cls) {
    var pct = goal > 0 ? Math.min(1, val / goal) : 0;
    return h('div', { class: 'mbar ' + cls }, [
      h('div', { class: 'mbar-top' }, [h('span', { text: label }), h('b', { text: fmtNum(val, 0) + ' / ' + fmtNum(goal, 0) + ' ' + t('kbju.g') })]),
      h('div', { class: 'bar' }, [h('div', { class: 'bar-fill' + (val > goal * 1.1 ? ' over' : ''), style: 'width:' + Math.round(pct * 100) + '%' })])
    ]);
  }
  function renderFoodSummary() {
    var k = foodDay(), tot = foodTotals(k), g = kcalGoal(), mt = macroTargets(g), box = el.foodSummary;
    box.innerHTML = '';
    var isToday = k === todayKey();
    box.appendChild(h('div', { class: 'day-nav' }, [
      h('button', { type: 'button', class: 'icon-btn', 'data-fday': '-1', 'aria-label': t('food.prevDay') }, [icon(ICON_L)]),
      h('span', { class: 'day-nav-lbl', text: dayLabel(k) }),
      h('button', { type: 'button', class: 'icon-btn', 'data-fday': '1', 'aria-label': t('food.nextDay') }, [icon(ICON_R)])
    ]));
    box.querySelector('[data-fday="1"]').disabled = isToday;
    var pct = g.v > 0 ? tot.kcal / g.v : 0;
    var left = g.v - tot.kcal;
    var head = h('div', { class: 'kcal-head' }, [
      h('div', { class: 'kcal-big' }, [
        h('b', { text: fmtNum(tot.kcal, 0) }), h('span', { text: ' / ' + fmtNum(g.v, 0) + ' ' + t('kbju.kcal') })
      ]),
      h('div', { class: 'kcal-left' + (left < 0 ? ' over' : ''), text: left >= 0 ? t('food.left', { v: fmtNum(left, 0) }) : t('food.over', { v: fmtNum(-left, 0) }) })
    ]);
    var ringWrap = h('div', { class: 'kcal-ring' });
    ringWrap.appendChild(ring(64, 7, Math.min(1, pct), pct > 1.05 ? '#f472b6' : 'grad'));
    ringWrap.appendChild(h('span', { text: Math.round(pct * 100) + '%' }));
    box.appendChild(h('div', { class: 'kcal-row' }, [head, ringWrap]));
    box.appendChild(h('div', { class: 'mbars' }, [
      barRow(t('kbju.p'), tot.p, mt.p, 'p'), barRow(t('kbju.f'), tot.f, mt.f, 'f'), barRow(t('kbju.c'), tot.c, mt.c, 'c')
    ]));
    // calorie goal (auto from profile or manual override)
    var goalRow = h('div', { class: 'goal-line' });
    if (!fs.goalEdit) {
      goalRow.appendChild(h('span', null, [
        h('b', { text: t('food.goal', { v: fmtNum(g.v, 0) }) }),
        h('span', { class: 'tag' + (g.auto ? ' auto' : ''), text: g.auto ? t('food.auto') : t('food.manual') })
      ]));
      goalRow.appendChild(h('button', { type: 'button', class: 'link-btn small', 'data-goal-edit': '1', text: t('food.edit') }));
      box.appendChild(goalRow);
      box.appendChild(h('p', { class: 'muted small goal-hint', text: g.e && g.auto ? t('food.goalHintAuto', { why: energyWhy(g.e) }) : g.def ? t('food.goalHintDef') : '' }));
    } else {
      var inp = h('input', { class: 'num-input', id: 'kcalGoalInput', type: 'text', inputmode: 'numeric', maxlength: '4', value: String(g.v) });
      goalRow.classList.add('editing');
      goalRow.appendChild(inp);
      goalRow.appendChild(h('span', { class: 'muted', text: t('kbju.kcal') }));
      goalRow.appendChild(h('button', { type: 'button', class: 'btn primary small', 'data-goal-save': '1', text: t('food.goalSave') }));
      goalRow.appendChild(h('button', { type: 'button', class: 'btn small', 'data-goal-auto': '1', text: t('food.goalAuto') }));
      box.appendChild(goalRow);
      if (g.e) box.appendChild(h('p', { class: 'muted small goal-hint', text: t('food.goalHintAuto', { why: energyWhy(g.e) }) + ' → ' + fmtNum(g.e.target, 0) + ' ' + t('kbju.kcal') }));
      setTimeout(function () { inp.focus(); inp.select(); }, 30);
    }
  }
  function foodResultBtn(f, grams) {
    return h('button', { type: 'button', class: 'fres', 'data-fsel': f.id, 'data-g': grams || '' }, [
      h('span', { class: 'fres-ico', 'aria-hidden': 'true', text: FOOD_CATS[f.cat] || '🍽' }),
      h('span', { class: 'fres-name', text: dbName(f) }),
      h('span', { class: 'fres-k', text: fmtNum(f.kcal, 0) + ' ' + t('kbju.kcal') + ' / 100 ' + t('kbju.g') })
    ]);
  }
  function renderFoodResults() {
    var box = el.foodResults;
    box.innerHTML = '';
    if (fs.sel) { box.hidden = true; return; }
    box.hidden = false;
    var q = el.foodSearch.value.trim();
    if (!q) {
      var rec = recentFoods(6);
      if (rec.length && window.V9Food) return;   // v9.2: recent items are one-tap chips in #v9FoodQuick
      var lbl = rec.length ? t('food.recent') : t('food.popular');
      box.appendChild(h('div', { class: 'fres-lbl', text: lbl }));
      if (rec.length) {
        rec.forEach(function (x) {
          var f = x.fid && FOOD_BY_ID[x.fid];
          if (f) box.appendChild(foodResultBtn(f, x.g));
          else box.appendChild(h('button', { type: 'button', class: 'fres', 'data-frecent': x.id }, [
            h('span', { class: 'fres-ico', 'aria-hidden': 'true', text: '✏️' }),
            h('span', { class: 'fres-name', text: x.name || t('food.meal') }),
            h('span', { class: 'fres-k', text: '+ ' + fmtNum(x.kcal, 0) + ' ' + t('kbju.kcal') })
          ]));
        });
      } else POPULAR.forEach(function (id) { if (FOOD_BY_ID[id]) box.appendChild(foodResultBtn(FOOD_BY_ID[id])); });
      return;
    }
    var res = searchFoods(q, 8);
    if (!res.length) {
      box.appendChild(h('div', { class: 'fres-empty' }, [
        h('span', { text: t('food.notFound') + ' ' }),
        h('button', { type: 'button', class: 'link-btn inline', 'data-fcustom-q': '1', text: t('food.addCustom', { q: q.slice(0, 40) }) })
      ]));
      return;
    }
    res.forEach(function (f) { box.appendChild(foodResultBtn(f)); });
  }
  function selectFood(id, grams) {
    var f = FOOD_BY_ID[id];
    if (!f) return;
    fs.sel = id;
    renderFoodPick(grams || 100);
    renderFoodResults();
    el.foodSearch.blur();
  }
  function renderFoodPick(grams) {
    var box = el.foodPick, f = FOOD_BY_ID[fs.sel];
    box.innerHTML = '';
    box.hidden = !f;
    if (!f) return;
    var g = t('kbju.g');
    box.appendChild(h('div', { class: 'pick-head' }, [
      h('span', { class: 'fres-ico', 'aria-hidden': 'true', text: FOOD_CATS[f.cat] || '🍽' }),
      h('div', { class: 'grow' }, [
        h('b', { class: 'pick-name', text: dbName(f) }),
        h('div', { class: 'muted small', text: t('food.per100') + ': ' + fmtNum(f.kcal, 0) + ' ' + t('kbju.kcal') + ' · ' +
          t('kbju.short', { p: fmtNum(f.p, 1) + g, f: fmtNum(f.f, 1) + g, c: fmtNum(f.c, 1) + g }) })
      ]),
      h('button', { type: 'button', class: 'icon-btn', 'data-fclose': '1', 'aria-label': t('food.close') }, [icon(ICON_X)])
    ]));
    var gInput = h('input', { class: 'num-input grams-input', id: 'pickGrams', type: 'text', inputmode: 'decimal', maxlength: '5', value: String(grams), 'aria-label': t('food.grams') });
    box.appendChild(h('div', { class: 'pick-grams' }, [
      h('button', { type: 'button', class: 'round-btn sm', 'data-gstep': '-10', 'aria-label': '−' }, ['−']),
      h('label', { class: 'grams-wrap' }, [gInput, h('span', { text: g })]),
      h('button', { type: 'button', class: 'round-btn sm', 'data-gstep': '10', 'aria-label': '+' }, ['+'])
    ]));
    var chips = h('div', { class: 'chips pick-chips' });
    if (f.por && [50, 100, 150, 200, 300].indexOf(f.por) < 0) chips.appendChild(h('button', { type: 'button', class: 'chip', 'data-gset': f.por, text: t('food.portion', { g: f.por }) }));
    [50, 100, 150, 200, 300].forEach(function (v) { chips.appendChild(h('button', { type: 'button', class: 'chip', 'data-gset': v, text: v + ' ' + g })); });
    box.appendChild(chips);
    box.appendChild(h('div', { class: 'pick-calc', id: 'pickCalc' }));
    box.appendChild(h('button', { type: 'button', class: 'btn primary wide', 'data-fadd': '1', text: t('food.addBtn') }));
    updatePickCalc();
  }
  function pickGrams() { var inp = $('pickGrams'); return inp ? parseInputNumber(inp.value) : NaN; }
  function updatePickCalc() {
    var f = FOOD_BY_ID[fs.sel], box = $('pickCalc');
    if (!f || !box) return;
    var gr = pickGrams(), ok = gr >= 1 && gr <= 3000;
    var v = ok ? portionOf(f, gr) : { kcal: 0, p: 0, f: 0, c: 0 }, g = t('kbju.g');
    box.innerHTML = '';
    box.appendChild(h('div', { class: 'pc-kcal' }, [h('b', { text: ok ? fmtNum(v.kcal, 0) : '—' }), h('small', { text: t('kbju.kcal') })]));
    box.appendChild(h('div', { class: 'macros' }, [
      h('div', { class: 'macro p' }, [h('b', { text: fmtNum(v.p, 1) + ' ' + g }), h('span', { text: t('kbju.p') })]),
      h('div', { class: 'macro f' }, [h('b', { text: fmtNum(v.f, 1) + ' ' + g }), h('span', { text: t('kbju.f') })]),
      h('div', { class: 'macro c' }, [h('b', { text: fmtNum(v.c, 1) + ' ' + g }), h('span', { text: t('kbju.c') })])
    ]));
    el.foodPick.querySelectorAll('[data-gset]').forEach(function (c) { c.classList.toggle('on', Number(c.dataset.gset) === gr); });
  }
  function addEntry(entry) {
    var k = foodDay();
    entry.id = uid(); entry.at = Date.now();
    (food[k] = food[k] || []).push(entry);
    saveFood();
    toast(t('food.added', { n: entryName(entry).slice(0, 40), k: fmtNum(entry.kcal, 0) }));
  }
  function addPicked() {
    var f = FOOD_BY_ID[fs.sel], gr = pickGrams();
    if (!f) return;
    if (!(gr >= 1 && gr <= 3000)) { toast(t('food.badGrams')); return; }
    gr = Math.round(gr);
    var v = portionOf(f, gr);
    addEntry({ fid: f.id, name: f.ru, g: gr, kcal: v.kcal, p: v.p, f: v.f, c: v.c });
    fs.sel = null; el.foodSearch.value = '';
    renderFood();
  }
  function addCustom() {
    var name = el.cName.value.trim().slice(0, 120);
    var vals = [el.cKcal, el.cP, el.cF, el.cC].map(function (i) { var r = i.value.trim(); return r === '' ? null : parseInputNumber(r); });
    if (vals.some(function (v) { return v !== null && !(isFinite(v) && v >= 0); })) { toast(t('food.cInvalid')); return; }
    var p = vals[1] || 0, f = vals[2] || 0, c = vals[3] || 0;
    var kcal = vals[0] !== null ? vals[0] : p * 4 + f * 9 + c * 4;
    if (!(kcal > 0 || vals[0] === 0) || kcal > 10000 || p > 1000 || f > 1000 || c > 2000) { toast(t('food.cInvalid')); return; }   // v9.4: an explicit 0 kcal is fine (water, black coffee)
    var ce = { name: name || t('food.customName'), kcal: Math.round(kcal), p: r1(p), f: r1(f), c: r1(c) };
    var fbi = $('cFib'), fbv = fbi && fbi.value.trim() !== '' ? parseInputNumber(fbi.value) : null;   // v9.2: optional fiber
    if (fbv !== null) { if (!(isFinite(fbv) && fbv >= 0 && fbv <= 300)) { toast(t('food.cInvalid')); return; } ce.fib = r1(fbv); }
    addEntry(ce);
    el.foodCustom.reset();
    renderFood();
  }
  function readdRecent(id) {
    var src = null;
    Object.keys(food).forEach(function (k) { food[k].forEach(function (x) { if (x.id === id) src = x; }); });
    if (!src) return;
    var re = { name: src.name, kcal: src.kcal, p: src.p, f: src.f, c: src.c };
    if (src.g) re.g = src.g; if (src.fib !== undefined) re.fib = src.fib; if (src.bc) re.bc = src.bc;
    addEntry(re);
    renderFood();
  }
  function removeFood(id) {
    var k = foodDay();
    food[k] = (food[k] || []).filter(function (x) { return x.id !== id; });
    if (!food[k].length) delete food[k];
    saveFood(); renderFood();
    toast(t('food.removed'));
  }
  function renderFoodDiary() {
    var k = foodDay(), list = food[k] || [], box = el.foodDiary;
    el.foodDiaryTitle.textContent = k === todayKey() ? t('food.diary') : t('food.diaryOf', { d: dayLabel(k) });
    box.innerHTML = '';
    if (!list.length) { box.appendChild(h('div', { class: 'food-empty', text: t('food.none') })); return; }
    list.forEach(function (x) {
      var sub = (x.g ? fmtNum(x.g, 0) + ' ' + t('kbju.g') + ' · ' : '') + macroLine(x.p, x.f, x.c) + (x.fib !== undefined ? ' · клетч. ' + fmtNum(x.fib, 1) + ' ' + t('kbju.g') : '');
      var fav = window.V9Food && window.V9Food.isFav(x);
      box.appendChild(h('div', { class: 'food-row' }, [
        window.V9Food ? h('button', { type: 'button', class: 'icon-btn v9-star' + (fav ? ' on' : ''), 'data-v9fav': x.id, 'aria-pressed': String(!!fav), 'aria-label': fav ? 'Убрать из избранного' : 'В избранное', text: fav ? '★' : '☆' }) : null,
        h('div', { class: 'fr-main' }, [h('span', { class: 'fr-name', text: entryName(x) }), h('span', { class: 'fr-sub', text: sub })]),
        h('span', { class: 'fr-k', text: fmtNum(x.kcal, 0) + ' ' + t('kbju.kcal') }),
        h('button', { type: 'button', class: 'icon-btn', 'data-food-del': x.id, 'aria-label': t('food.remove') }, [icon(ICON_X)])
      ]));
    });
  }
  function renderCoach() {
    el.qaChips.innerHTML = '';
    COACH.answers.forEach(function (a) {
      el.qaChips.appendChild(h('button', {
        type: 'button', class: 'qa-chip' + (fs.answer === a.id ? ' on' : ''), 'data-qa': a.id, 'aria-expanded': String(fs.answer === a.id)
      }, [a.icon + ' ' + (a.q[settings.lang] || a.q.ru)]));
    });
    var ans = COACH.answers.filter(function (a) { return a.id === fs.answer; })[0];
    el.qaAnswer.hidden = !ans;
    el.qaAnswer.innerHTML = '';
    if (ans) {
      el.qaAnswer.appendChild(h('h3', { text: ans.icon + ' ' + (ans.q[settings.lang] || ans.q.ru) }));
      var ul = h('ul');
      (ans.a[settings.lang] || ans.a.ru).forEach(function (line) { ul.appendChild(h('li', { text: line })); });
      el.qaAnswer.appendChild(ul);
    }
    el.tipsList.innerHTML = '';
    var tips = fs.tipsAll ? COACH.tips : COACH.tips.slice(0, 4);
    tips.forEach(function (tp) {
      el.tipsList.appendChild(h('div', { class: 'tip' }, [h('span', { class: 'tip-ico', 'aria-hidden': 'true', text: tp.icon }), h('p', { text: tp[settings.lang] || tp.ru })]));
    });
    if (COACH.tips.length > 4) el.tipsList.appendChild(h('button', { type: 'button', class: 'link-btn', 'data-tips-toggle': '1', text: fs.tipsAll ? t('coach.less') : t('coach.more') }));
    el.tipsList.appendChild(h('p', { class: 'muted small coach-note', text: t('coach.note') }));
  }
  function renderFood() {
    document.querySelectorAll('[data-fmode]').forEach(function (b) {
      var on = b.dataset.fmode === fs.mode;
      b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
    });
    el.foodDbPane.hidden = fs.mode !== 'db';
    el.foodCustom.hidden = fs.mode !== 'custom';
    renderFoodSummary();
    renderFoodResults();
    if (fs.sel) { var pg = pickGrams(); renderFoodPick(pg >= 1 && pg <= 3000 ? pg : 100); }
    if (!fs.sel) { el.foodPick.hidden = true; el.foodPick.innerHTML = ''; }
    renderFoodDiary();
    renderCoach();
    if (window.V9Food) window.V9Food.render();   // v9.2: repeat yesterday, favourites, recent, barcode
  }
  function renderFoodPromo() {
    var k = todayKey(), tot = foodTotals(k), g = kcalGoal();
    el.foodPromoSub.textContent = (food[k] || []).length ? t('food.promoSub', { a: fmtNum(tot.kcal, 0), b: fmtNum(g.v, 0) }) : t('food.promoNone');
  }

  // food events
  el.foodSearch.addEventListener('input', function () { fs.sel = null; el.foodPick.hidden = true; renderFoodResults(); });
  el.foodSearch.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var first = el.foodResults.querySelector('[data-fsel]');
    if (first) selectFood(first.dataset.fsel, Number(first.dataset.g) || 100);
  });
  el.foodResults.addEventListener('click', function (e) {
    var b = e.target.closest('[data-fsel]');
    if (b) { selectFood(b.dataset.fsel, Number(b.dataset.g) || 100); return; }
    var r = e.target.closest('[data-frecent]');
    if (r) { readdRecent(r.dataset.frecent); return; }
    if (e.target.closest('[data-fcustom-q]')) {
      fs.mode = 'custom'; el.cName.value = el.foodSearch.value.trim().slice(0, 120);
      renderFood(); setTimeout(function () { el.cKcal.focus(); }, 30);
    }
  });
  el.foodPick.addEventListener('click', function (e) {
    if (e.target.closest('[data-fclose]')) { fs.sel = null; renderFood(); el.foodSearch.focus(); return; }
    var c = e.target.closest('[data-gset]'), s = e.target.closest('[data-gstep]'), inp = $('pickGrams');
    if (c && inp) { inp.value = c.dataset.gset; updatePickCalc(); return; }
    if (s && inp) {
      var cur = pickGrams(); if (!isFinite(cur)) cur = 0;
      var st = Number(s.dataset.gstep), nv = st > 0 ? Math.floor(cur / 10 + 1e-9) * 10 + 10 : Math.ceil(cur / 10 - 1e-9) * 10 - 10;
      inp.value = String(Math.max(10, Math.min(3000, nv))); updatePickCalc(); return;
    }
    if (e.target.closest('[data-fadd]')) addPicked();
  });
  el.foodPick.addEventListener('input', function (e) { if (e.target.id === 'pickGrams') updatePickCalc(); });
  el.foodPick.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'pickGrams') { e.preventDefault(); addPicked(); } });
  el.foodPick.addEventListener('focusin', function (e) { if (e.target.id === 'pickGrams') e.target.select(); });
  el.foodCustom.addEventListener('submit', function (e) { e.preventDefault(); addCustom(); });
  el.foodAddCard.addEventListener('click', function (e) {
    var b = e.target.closest('[data-fmode]');
    if (b) { fs.mode = b.dataset.fmode; renderFood(); }
  });
  el.foodDiary.addEventListener('click', function (e) {
    var b = e.target.closest('[data-food-del]');
    if (b) removeFood(b.dataset.foodDel);
  });
  function saveKcalGoal() {
    var inp = $('kcalGoalInput'), v = inp ? parseInputNumber(inp.value) : NaN;
    if (!(v >= 800 && v <= 6000)) { toast(t('food.goalInvalid')); return; }
    settings.kcal = Math.round(v); persist();
    fs.goalEdit = false; renderFood();
    toast(t('food.goalSaved', { v: fmtNum(settings.kcal, 0) }));
  }
  function setAutoGoal() {
    settings.kcal = null; persist();
    fs.goalEdit = false;
    render();
    toast(t('food.goalAutoSet'));
  }
  el.foodSummary.addEventListener('click', function (e) {
    var d = e.target.closest('[data-fday]');
    if (d && !d.disabled) {
      var nk = toKey(addDays(parseKey(foodDay()), Number(d.dataset.fday)));
      fs.day = nk >= todayKey() ? null : nk;
      renderFood(); return;
    }
    if (e.target.closest('[data-goal-edit]')) { fs.goalEdit = true; renderFoodSummary(); return; }
    if (e.target.closest('[data-goal-save]')) { saveKcalGoal(); return; }
    if (e.target.closest('[data-goal-auto]')) setAutoGoal();
  });
  el.foodSummary.addEventListener('keydown', function (e) {
    if (e.target.id !== 'kcalGoalInput') return;
    if (e.key === 'Enter') { e.preventDefault(); saveKcalGoal(); }
    if (e.key === 'Escape') { e.stopPropagation(); fs.goalEdit = false; renderFoodSummary(); }
  });
  el.qaChips.addEventListener('click', function (e) {
    var b = e.target.closest('[data-qa]');
    if (!b) return;
    fs.answer = fs.answer === b.dataset.qa ? null : b.dataset.qa;
    renderCoach();
    if (fs.answer) el.qaAnswer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  el.tipsList.addEventListener('click', function (e) {
    if (e.target.closest('[data-tips-toggle]')) { fs.tipsAll = !fs.tipsAll; renderCoach(); }
  });

  // ---------- workouts: form state ----------
  var WK_OPTS = { goal: ['fat_loss', 'muscle', 'general'], level: ['beginner', 'intermediate', 'advanced'], equipment: ['none', 'home', 'gym'] };
  var WK_PREFIX = { goal: 'wk.g.', level: 'wk.l.', equipment: 'wk.e.' };
  function sanitizePlan(p) {
    if (!p || p.v !== 2 || !Array.isArray(p.days) || !p.days.length || p.days.length > 7) return null;
    var days = p.days.map(function (d) {
      var items = (Array.isArray(d.items) ? d.items : []).filter(function (it) { return it && EX_BY_ID[it.id]; }).slice(0, 12).map(function (it) {
        return { id: it.id, sets: clampNum(it.sets, 1, 12, 0), lo: clampNum(it.lo, 1, 120, 0), hi: clampNum(it.hi, 1, 120, 0),
          u: ['r', 'rs', 's', 'ss', 'm'].indexOf(it.u) >= 0 ? it.u : 'r', rest: clampNum(it.rest, 0, 600, 0), k: it.k === 'w' || it.k === 'f' ? it.k : '' };
      });
      return { wd: clampNum(d.wd, 0, 6, 0), tpl: String(d.tpl || '').slice(0, 8), items: items };
    });
    return { v: 2, seed: Number(p.seed) || 1, split: String(p.split || 'fb').slice(0, 6), days: days };
  }
  function sanitizePlanStore(o) {
    var form = { goal: 'general', level: 'beginner', equipment: 'home', days: 3, age: null, weight: null, height: null, weightKey: null };
    if (!o || typeof o !== 'object') return { form: form, plan: null, at: 0, legacy: false };
    var f = o.form || {};
    Object.keys(WK_OPTS).forEach(function (k) { if (WK_OPTS[k].indexOf(f[k]) >= 0) form[k] = f[k]; });
    var d = Number(f.days); if (d >= 1 && d <= 7) form.days = Math.round(d);
    ['age', 'weight', 'height'].forEach(function (k) { var v = Number(f[k]); if (f[k] !== null && f[k] !== undefined && isFinite(v) && v > 0) form[k] = v; });
    if (isValidKey(f.weightKey)) form.weightKey = f.weightKey;
    var plan = sanitizePlan(o.plan);
    return { form: form, plan: plan, at: Number(o.at) || 0, legacy: !plan && !!(o.plan && o.plan.weekly) };
  }
  var planStore = sanitizePlanStore(readJSON(PLAN_KEY, null));
  var wk = { form: planStore.form };
  function savePlanStore() {
    planStore.form = wk.form;
    if (!writeJSON(PLAN_KEY, { form: planStore.form, plan: planStore.plan, at: planStore.at })) toast(t('data.storageError'));
  }

  // ---------- workouts: rule-based generator ----------
  var LV = { beginner: 0, intermediate: 1, advanced: 2 };
  var EQ_OK = { none: ['bw'], home: ['bw', 'home'], gym: ['bw', 'home', 'gym'] };
  var EQ_RANK = { bw: 1, home: 2, gym: 3 };
  var TPL = {
    fbA: { f: 'fb', s: 'A', slots: ['squat', 'push_h', 'pull_h', 'hinge', 'core', 'delt', 'biceps'] },
    fbB: { f: 'fb', s: 'B', slots: ['hinge', 'push_v', 'pull_v', 'lunge', 'core', 'triceps', 'calves'] },
    fbC: { f: 'fb', s: 'C', slots: ['lunge', 'push_h', 'pull_h', 'glute', 'core', 'rear_delt', 'biceps'] },
    upA: { f: 'upper', s: 'A', slots: ['push_h', 'pull_h', 'push_v', 'pull_v', 'delt', 'biceps', 'triceps'] },
    loA: { f: 'lower', s: 'A', slots: ['squat', 'hinge', 'lunge', 'core', 'calves', 'quad_iso', 'ham_iso'] },
    upB: { f: 'upper', s: 'B', slots: ['pull_v', 'push_h', 'pull_h', 'push_v', 'rear_delt', 'triceps', 'biceps'] },
    loB: { f: 'lower', s: 'B', slots: ['hinge', 'squat', 'lunge', 'glute', 'core', 'ham_iso', 'calves'] },
    push: { f: 'push', s: '', slots: ['push_h', 'push_v', 'push_h', 'delt', 'triceps', 'chest_iso', 'core'] },
    pull: { f: 'pull', s: '', slots: ['pull_v', 'pull_h', 'rear_delt', 'biceps', 'pull_h', 'back_ext', 'core'] },
    legs: { f: 'legs', s: '', slots: ['squat', 'hinge', 'lunge', 'glute', 'calves', 'core', 'quad_iso'] },
    cond: { f: 'cond', s: '', slots: [] },
    rec: { f: 'rec', s: '', slots: [] }
  };
  var SPLITS = {
    1: ['fbA'], 2: ['fbA', 'fbB'], 3: ['fbA', 'fbB', 'fbC'], 4: ['upA', 'loA', 'upB', 'loB'],
    5: ['push', 'pull', 'legs', 'upA', 'loB'], 6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
    7: ['push', 'pull', 'legs', 'push', 'pull', 'legs', 'rec']
  };
  var SPLITS_BEGINNER = { 5: ['upA', 'loA', 'cond', 'upB', 'loB'], 6: ['upA', 'loA', 'cond', 'upB', 'loB', 'cond'], 7: ['upA', 'loA', 'cond', 'upB', 'loB', 'cond', 'rec'] };
  var WEEKDAYS = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };

  function planContext(form) {
    var hm = form.height / 100, bmi = form.weight / (hm * hm), lv = LV[form.level];
    return {
      lv: lv, goal: form.goal, age: form.age, bmi: bmi, eq: EQ_OK[form.equipment], equipment: form.equipment,
      impactOk: form.age < 50 && bmi < 30, rnd: null, weekUsed: {}, dayUsed: {}
    };
  }
  function pickEx(pattern, ctx) {
    var light = pattern === 'core' || pattern === 'cardio' || pattern === 'calves' || pattern === 'mobility';
    var best = null, bs = -1e9;
    EXERCISES.forEach(function (x) {
      if (x.pat.indexOf(pattern) < 0 || ctx.eq.indexOf(x.eq) < 0 || ctx.lv < x.lvMin || ctx.lv > x.lvMax) return;
      if ((x.impact && !ctx.impactOk) || ctx.dayUsed[x.id]) return;
      var s = EQ_RANK[x.eq] * (light ? 0.3 : 1.5) - (ctx.weekUsed[x.id] || 0) * 2.5 + (x.pat[0] === pattern ? 1 : 0) + ctx.rnd() * 2;
      if (s > bs) { bs = s; best = x; }
    });
    return best;
  }
  function scheme(ex, ctx, first) {
    var lv = ctx.lv, goal = ctx.goal;
    var sets = { fat_loss: [2, 3, 3], muscle: [3, 3, 4], general: [2, 3, 3] }[goal][lv];
    if (!ex.compound) sets = Math.min(sets, 3);
    var lo, hi, rest;
    if (goal === 'fat_loss') { lo = 12; hi = 15; rest = ex.compound ? 45 : 30; }
    else if (goal === 'muscle') {
      if (ex.compound) { var heavy = first && lv === 2; lo = heavy ? 6 : 8; hi = heavy ? 8 : 10; rest = heavy ? 120 : 90; }
      else { lo = 10; hi = 12; rest = 60; }
    } else { lo = ex.compound ? 10 : 12; hi = ex.compound ? 12 : 15; rest = ex.compound ? 60 : 45; }
    var pat = ex.pat[0];
    if (pat === 'core' || pat === 'back_ext' || pat === 'calves') { lo = [10, 12, 15][lv]; hi = [12, 15, 20][lv]; rest = Math.min(rest, 45); }
    if (ctx.age >= 50) { lo = Math.max(lo, 8); hi = Math.max(hi, 12); rest += 15; sets = Math.min(sets, 3); }
    if (ctx.age < 18) { lo = Math.max(lo, 10); hi = Math.max(hi, 15); sets = Math.min(sets, 3); }
    if (ex.secs) { var sec = [[20, 30], [30, 45], [45, 60]][lv]; return { sets: sets, lo: sec[0], hi: sec[1], u: ex.uni ? 'ss' : 's', rest: Math.min(rest, 45) }; }
    return { sets: sets, lo: lo, hi: hi, u: ex.uni ? 'rs' : 'r', rest: rest };
  }
  function item(ex, sc, kind) { return { id: ex.id, sets: sc.sets, lo: sc.lo, hi: sc.hi, u: sc.u, rest: sc.rest, k: kind || '' }; }
  function cardioItem(ctx, minutes, kind) {
    // conditioning: machines in the gym, low-impact walking when jumps are excluded, intervals otherwise
    var ex;
    if (ctx.equipment === 'gym') ex = pickEx('cardio', { eq: ['gym'], lv: ctx.lv, impactOk: false, dayUsed: {}, weekUsed: ctx.weekUsed, rnd: ctx.rnd });
    if (!ex && (!ctx.impactOk || ctx.lv === 0 || minutes > 15)) ex = EX_BY_ID.brisk_walk;
    if (!ex) ex = pickEx('cardio', { eq: ctx.eq, lv: ctx.lv, impactOk: ctx.impactOk, dayUsed: { brisk_walk: 1, jump_squat: 1, kb_swing: 1 }, weekUsed: ctx.weekUsed, rnd: ctx.rnd });
    if (!ex) ex = EX_BY_ID.brisk_walk;
    ctx.weekUsed[ex.id] = (ctx.weekUsed[ex.id] || 0) + 1;
    if (ex.mins) return item(ex, { sets: 1, lo: minutes, hi: minutes + 5, u: 'm', rest: 0 }, kind);
    return item(ex, { sets: [6, 8, 10][ctx.lv], lo: 30, hi: 30, u: 's', rest: 30 }, kind);   // 30/30 intervals
  }
  function buildDay(tplId, ctx) {
    var tpl = TPL[tplId], items = [];
    ctx.dayUsed = {};
    var warm = ctx.age >= 50 ? { lo: 8, hi: 10 } : { lo: 5, hi: 8 };
    items.push(item(EX_BY_ID.warmup, { sets: 1, lo: warm.lo, hi: warm.hi, u: 'm', rest: 0 }, 'w'));
    if (tplId === 'rec') {
      items.push(item(EX_BY_ID.brisk_walk, { sets: 1, lo: 30, hi: 40, u: 'm', rest: 0 }));
      items.push(item(EX_BY_ID.cat_cow, { sets: 2, lo: 8, hi: 10, u: 'r', rest: 0 }));
      items.push(item(EX_BY_ID.hip_stretch, { sets: 2, lo: 30, hi: 30, u: 'ss', rest: 0 }));
      items.push(item(EX_BY_ID.stretch, { sets: 1, lo: 10, hi: 10, u: 'm', rest: 0 }));
      return { tpl: tplId, items: items };
    }
    if (tplId === 'cond') {
      items.push(cardioItem(ctx, ctx.lv === 0 ? 20 : 25));
      for (var ci = 0; ci < 2; ci++) {
        var cx = pickEx('core', ctx);
        if (cx) { ctx.dayUsed[cx.id] = 1; ctx.weekUsed[cx.id] = (ctx.weekUsed[cx.id] || 0) + 1; items.push(item(cx, scheme(cx, ctx, false))); }
      }
      items.push(item(EX_BY_ID.stretch, { sets: 1, lo: 5, hi: 10, u: 'm', rest: 0 }));
      return { tpl: tplId, items: items };
    }
    var n = [4, 5, 6][ctx.lv];
    if (ctx.age >= 60) n = Math.min(n, 5);
    var count = 0, firstCompound = true;
    for (var i = 0; i < tpl.slots.length && count < n; i++) {
      var ex = pickEx(tpl.slots[i], ctx);
      if (!ex) continue;
      ctx.dayUsed[ex.id] = 1;
      ctx.weekUsed[ex.id] = (ctx.weekUsed[ex.id] || 0) + 1;
      items.push(item(ex, scheme(ex, ctx, ex.compound && firstCompound)));
      if (ex.compound) firstCompound = false;
      count++;
    }
    if (ctx.goal === 'fat_loss') items.push(cardioItem(ctx, [10, 12, 15][ctx.lv], 'f'));
    else if (ctx.goal === 'general') items.push(cardioItem(ctx, 10, 'f'));
    if (ctx.lv === 0 || ctx.age >= 50) items.push(item(EX_BY_ID.stretch, { sets: 1, lo: 5, hi: 5, u: 'm', rest: 0 }));
    return { tpl: tplId, items: items };
  }
  function generatePlan(form, seed) {
    var ctx = planContext(form);
    ctx.rnd = mulberry32(seed);
    var split = (ctx.lv === 0 && SPLITS_BEGINNER[form.days]) || SPLITS[form.days];
    var wds = WEEKDAYS[form.days];
    var days = split.map(function (tplId, i) { var d = buildDay(tplId, ctx); d.wd = wds[i]; return d; });
    var kind = form.days <= 3 ? 'fb' : (ctx.lv === 0 && form.days >= 5) ? 'mix' : form.days === 4 ? 'ul' : 'ppl';
    return { v: 2, seed: seed, split: kind, days: days };
  }
  function itemMinutes(it) {
    if (it.u === 'm') return (it.lo + it.hi) / 2 * it.sets;
    var work = it.u === 's' ? (it.lo + it.hi) / 2 : it.u === 'ss' ? it.lo + it.hi : it.u === 'rs' ? 70 : 40;
    return it.sets * (work + it.rest) / 60;
  }
  function dayMinutes(d) { return Math.max(10, Math.round(d.items.reduce(function (a, it) { return a + itemMinutes(it); }, 0) / 5) * 5); }
  function fmtRest(s) { return s >= 120 && s % 60 === 0 ? (s / 60) + ' ' + t('wk.u.m') : s + ' ' + t('wk.u.s'); }
  function fmtReps(it) {
    var r = it.lo === it.hi ? String(it.lo) : it.lo + '–' + it.hi;
    if (it.u === 's') return r + ' ' + t('wk.u.s');
    if (it.u === 'ss') return r + ' ' + t('wk.u.s') + t('wk.u.side');
    if (it.u === 'm') return r + ' ' + t('wk.u.m');
    if (it.u === 'rs') return r + t('wk.u.side');
    return r;
  }
  function planNotes(form) {
    var ctx = planContext(form), notes = [];
    var e = calcEnergy({ age: form.age, weight: form.weight, height: form.height, sex: settings.sex, activity: settings.activity, goal: form.goal });
    if (form.level === 'beginner') notes.push(t('wk.n.beginner'));
    notes.push(t('wk.n.progress'));
    notes.push(e ? t('wk.n.' + form.goal, { k: fmtNum(settings.kcal || e.target, 0), p: fmtNum(e.protein, 0) }) : t('wk.n.nutriNone'));
    if (form.age < 18) notes.push(t('wk.n.teen'));
    if (form.age >= 50) notes.push(t('wk.n.age50'));
    else if (ctx.bmi >= 30) notes.push(t('wk.n.bmi'));
    if (form.equipment === 'none') notes.push(t('wk.n.none'));
    if (form.level === 'beginner' && form.days >= 5) notes.push(t('wk.n.extraDays'));
    notes.push(t('wk.n.recovery'));
    return notes;
  }

  // ---------- workouts: UI ----------
  function segButtons(container, key) {
    container.innerHTML = '';
    WK_OPTS[key].forEach(function (v) {
      container.appendChild(h('button', {
        type: 'button', class: 'seg-btn' + (wk.form[key] === v ? ' active' : ''), 'data-wk': key, 'data-v': v,
        'aria-pressed': String(wk.form[key] === v), text: t(WK_PREFIX[key] + v)
      }));
    });
  }
  function sexButtons(container, short) {
    container.innerHTML = '';
    ['m', 'f'].forEach(function (v) {
      container.appendChild(h('button', {
        type: 'button', class: 'seg-btn' + (settings.sex === v ? ' active' : ''), 'data-sex': v,
        'aria-pressed': String(settings.sex === v), text: t((short ? 'sex.' + v + 'Short' : 'sex.' + v))
      }));
    });
  }
  function fillWorkoutInputs() {
    var w = currentWeight();
    var age = settings.age || wk.form.age, height = settings.height || wk.form.height;
    el.wkAge.value = age ? Math.round(age) : '';
    el.wkWeight.value = w ? String(Math.round(w * 10) / 10).replace('.', settings.lang === 'ru' ? ',' : '.') : '';
    el.wkHeight.value = height ? Math.round(height) : '';
  }
  function formInputs() {
    return { age: parseInputNumber(el.wkAge.value), weight: parseInputNumber(el.wkWeight.value), height: parseInputNumber(el.wkHeight.value) };
  }
  function statBox(val, lbl, hint) {
    return h('div', { class: 'stat' }, [h('div', { class: 'stat-val', text: val }), h('div', { class: 'stat-lbl', text: lbl }), hint ? h('div', { class: 'stat-hint', text: hint }) : null]);
  }
  function renderEnergy() {
    var fi = formInputs(), box = el.wkEnergy;
    var e = calcEnergy({ age: fi.age, weight: fi.weight, height: fi.height, sex: settings.sex, activity: settings.activity, goal: wk.form.goal });
    box.innerHTML = '';
    box.appendChild(h('div', { class: 'card-head' }, [h('h2', { text: t('en.title') })]));
    if (!e) { box.appendChild(h('p', { class: 'muted small', text: t('en.need') })); return; }
    box.appendChild(h('div', { class: 'stats en-stats' }, [
      statBox(fmtNum(e.bmr, 0), t('en.bmr'), t('en.bmrHint')),
      statBox(fmtNum(e.tdee, 0), t('en.tdee'), t('en.tdeeHint', { f: fmtNum(e.factor, 3) })),
      statBox(fmtNum(e.target, 0), t('en.target'), t('en.adj.' + e.goal)),
      statBox(fmtNum(e.protein, 0), t('en.protein'), t('en.proteinRange', { lo: e.proteinLo, hi: e.proteinHi }))
    ]));
    box.appendChild(h('p', { class: 'en-macros', text: t('en.macros', { p: e.protein, f: e.fat, c: e.carbs }) }));
    var hints = [];
    if (!e.sexKnown) hints.push(t('en.sexHint'));
    if (e.adjusted) hints.push(t('en.refWeight', { w: e.refW }));
    if (e.floorHit) hints.push(t('en.floor', { v: e.floorV }));
    hints.forEach(function (x) { box.appendChild(h('p', { class: 'muted small', text: x })); });
    var row = h('div', { class: 'en-diary' });
    if (settings.kcal) {
      row.appendChild(h('span', { class: 'muted small', text: t('en.diaryManual', { v: fmtNum(settings.kcal, 0) }) }));
      row.appendChild(h('button', { type: 'button', class: 'btn small', 'data-en-auto': '1', text: t('en.useAuto') }));
    } else row.appendChild(h('span', { class: 'muted small', text: t('en.diaryAuto') }));
    row.appendChild(h('a', { class: 'btn small ghost', href: '#food', text: t('en.openDiary') }));
    box.appendChild(row);
  }
  function renderWorkouts(opts) {
    if (opts && opts.scroll) fillWorkoutInputs();
    sexButtons(el.wkSex, false);
    segButtons(el.wkGoal, 'goal');
    segButtons(el.wkLevel, 'level');
    segButtons(el.wkEquip, 'equipment');
    el.wkDays.textContent = wk.form.days;
    if (el.wkActivity.options.length !== ACT_ORDER.length || el.wkActivity.dataset.lang !== settings.lang) {
      el.wkActivity.innerHTML = '';
      ACT_ORDER.forEach(function (a) { el.wkActivity.appendChild(h('option', { value: a, text: t('act.' + a) })); });
      el.wkActivity.dataset.lang = settings.lang;
    }
    el.wkActivity.value = settings.activity;
    el.wkSubmit.textContent = t('wk.generate');
    renderEnergy();
    renderPlan();
    renderExLibrary();
  }
  function renderPlan() {
    var box = el.wkResult, p = planStore.plan;
    box.innerHTML = '';
    if (!p) return;
    var f = planStore.form, wdNames = t('weekdays');
    var mins = p.days.filter(function (d) { return d.tpl !== 'rec'; }).map(dayMinutes);
    var avgMin = mins.length ? Math.round(avg(mins) / 5) * 5 : 0;
    var meta = [t('wk.g.' + f.goal), t('wk.l.' + f.level), t('wk.e.' + f.equipment)].join(' · ');
    if (planStore.at) meta += ' · ' + t('wk.generated', { d: new Date(planStore.at).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) });
    box.appendChild(h('section', { class: 'card' }, [
      h('div', { class: 'card-head' }, [h('h2', { text: t('wk.summary') })]),
      h('p', { class: 'plan-summary' }, [
        h('b', { text: t('wk.split.' + p.split) }), ' · ' + t('wk.perWeek', { n: plural(f.days, 'w.day') }) + ' · ' + t('wk.min', { m: avgMin })
      ]),
      h('p', { class: 'plan-scheme', text: t('wk.scheme.' + f.goal) }),
      h('div', { class: 'plan-meta', text: meta })
    ]));
    p.days.forEach(function (d, di) {
      var tpl = TPL[d.tpl] || { f: 'fb', s: '' };
      var ul = h('ul', { class: 'ex-list' });
      d.items.forEach(function (it) {
        var ex = EX_BY_ID[it.id];
        var metaEl = h('div', { class: 'ex-meta' });
        metaEl.appendChild(h('span', { class: 'sr', text: it.sets > 1 ? t('wk.sets', { s: it.sets, r: fmtReps(it) }) : fmtReps(it) }));
        if (it.rest) metaEl.appendChild(h('span', { text: t('wk.rest', { v: fmtRest(it.rest) }) }));
        ul.appendChild(h('li', { class: 'ex ex-has-img' + (it.k ? ' ex-' + it.k : ''), 'data-ex': ex.id, role: 'button', tabIndex: 0 }, [
          exImg(ex, 'ex-thumb'),
          h('div', { class: 'ex-body' }, [h('span', { class: 'ex-name', text: ex[settings.lang] || ex.ru }), metaEl])
        ]));
      });
      box.appendChild(h('section', { class: 'day-card' }, [
        h('div', { class: 'day-head' }, [
          h('span', { class: 'day-n', text: wdNames[d.wd] }),
          h('h3', { text: t('wk.f.' + tpl.f) + (tpl.s ? ' ' + tpl.s : '') }),
          h('span', { class: 'day-min', text: t('wk.min', { m: dayMinutes(d) }) })
        ]),
        ul,
        d.tpl !== 'rec' ? h('button', { type: 'button', class: 'btn small primary day-start', 'data-hs-start': String(di), text: settings.lang === 'en' ? '▶ Start workout' : '▶ Начать тренировку' }) : null
      ]));
    });
    var nl = h('ul', { class: 'plan-notes' });
    planNotes(f).forEach(function (n) { nl.appendChild(h('li', { text: n })); });
    box.appendChild(h('section', { class: 'card' }, [h('div', { class: 'card-head' }, [h('h2', { text: t('wk.notes') })]), nl]));
    box.appendChild(h('div', { class: 'plan-actions' }, [h('button', { type: 'button', class: 'btn', 'data-wk-regen': '1', text: t('wk.regenerate') })]));
  }

  // ---------- v7: exercise illustrations (img/ex/<id>.svg), library and detail sheet ----------
  var MG = {
    ru: { full: 'Всё тело', back: 'Спина', legs: 'Ноги', glutes: 'Ягодицы', hamstrings: 'Задняя поверхность бедра', chest: 'Грудь', shoulders: 'Плечи',
      biceps: 'Бицепс', triceps: 'Трицепс', core: 'Пресс и кор', calves: 'Икры', cardio: 'Кардио', arms: 'Руки', quads: 'Квадрицепс' },
    en: { full: 'Full body', back: 'Back', legs: 'Legs', glutes: 'Glutes', hamstrings: 'Hamstrings', chest: 'Chest', shoulders: 'Shoulders',
      biceps: 'Biceps', triceps: 'Triceps', core: 'Core', calves: 'Calves', cardio: 'Cardio', arms: 'Arms', quads: 'Quads' }
  };
  var EQ = { ru: { bw: 'Без инвентаря', home: 'Дома', gym: 'Зал' }, en: { bw: 'No equipment', home: 'Home', gym: 'Gym' } };
  var CUES = {
    warmup: 'Начни медленно: круговые движения в суставах, затем 2–3 минуты лёгкого кардио до тепла в мышцах.',
    mobility: 'Плавно, без рывков и боли. Дыши ровно, задерживайся в крайней точке на 2–3 вдоха.',
    squat: 'Стопы на ширине плеч, колени смотрят туда же, куда носки. Спина ровная, вес на всей стопе, опускайся под контролем.',
    hinge: 'Движение тазом назад, спина нейтральная, гриф или вес близко к ногам. Вставая, напрягай ягодицы, не прогибайся в пояснице.',
    lunge: 'Шаг достаточно длинный, корпус прямо, переднее колено над стопой. Опускайся вертикально вниз.',
    push_h: 'Лопатки сведены и опущены, локти под углом ~45° к корпусу. Опускайся под контролем, жми мощно.',
    push_v: 'Пресс и ягодицы напряжены, не прогибайся в пояснице. Жми вверх по прямой, голова уходит чуть вперёд в верхней точке.',
    pull_h: 'Тяни локтями к поясу, своди лопатки в конце движения. Корпус неподвижен, без раскачки.',
    pull_v: 'Начинай движение с опускания лопаток, тяни локти вниз к рёбрам. Без рывков и раскачки.',
    delt: 'Небольшой вес, локти чуть согнуты, поднимай до уровня плеч. Не помогай корпусом.',
    rear_delt: 'Лёгкий вес, руки разводятся в стороны за счёт задней дельты, лопатки не сжимаются до конца.',
    chest_iso: 'Локти слегка согнуты и зафиксированы, движение по дуге, растяжение в груди без боли в плечах.',
    biceps: 'Локти прижаты к корпусу, поднимай без раскачки, опускай медленно (2–3 с).',
    triceps: 'Плечо неподвижно, работает только локоть. Полное выпрямление руки в конце.',
    calves: 'Подъём на носки в полную амплитуду, пауза наверху 1 с, медленно вниз.',
    quad_iso: 'Плавно выпрямляй ноги, пауза в верхней точке, без рывков.',
    ham_iso: 'Сгибай ноги под контролем, таз прижат, медленное опускание.',
    glute: 'В верхней точке сожми ягодицы на 1–2 с, поясница не прогибается.',
    core: 'Поясница прижата/нейтральна, пресс напряжён, дыши ровно — не задерживай дыхание.',
    back_ext: 'Поднимайся до прямой линии корпуса, без переразгибания в пояснице.',
    cardio: 'Темп, при котором можно говорить короткими фразами. Начни с 3–5 минут разминки.'
  };
  function exImg(ex, cls) {
    return h('img', { class: 'ex-img ' + (cls || ''), src: 'img/ex/' + ex.id + '.svg?v=7', alt: ex[settings.lang] || ex.ru, loading: 'lazy', decoding: 'async', width: 240, height: 180 });
  }
  var libEq = 'all';
  function renderExLibrary() {
    var box = document.getElementById('exLibrary'); if (!box) return;
    var en = settings.lang === 'en';
    var list = EXERCISES.filter(function (x) { return libEq === 'all' || x.eq === libEq; });
    box.innerHTML = '';
    var head = h('div', { class: 'card-head' }, [h('h2', { text: en ? 'Exercise library' : 'Библиотека упражнений' }), h('span', { class: 'muted small', text: String(list.length) })]);
    var seg = h('div', { class: 'seg seg-full ex-lib-seg', role: 'group' });
    [['all', en ? 'All' : 'Все']].concat(['bw', 'home', 'gym'].map(function (k) { return [k, EQ[en ? 'en' : 'ru'][k]]; })).forEach(function (o) {
      seg.appendChild(h('button', { type: 'button', class: 'seg-btn' + (libEq === o[0] ? ' active' : ''), 'data-lib-eq': o[0], text: o[1] }));
    });
    var grid = h('div', { class: 'ex-lib' });
    list.forEach(function (x) {
      grid.appendChild(h('button', { type: 'button', class: 'ex-tile', 'data-ex': x.id }, [
        exImg(x, ''), h('span', { class: 'ex-tile-name', text: x[settings.lang] || x.ru }),
        h('small', { text: (MG[en ? 'en' : 'ru'][x.mg] || x.mg) + ' · ' + EQ[en ? 'en' : 'ru'][x.eq] })
      ]));
    });
    box.appendChild(head); box.appendChild(seg); box.appendChild(grid);
  }
  function openExercise(id) {
    var x = EX_BY_ID[id]; if (!x) return;
    var en = settings.lang === 'en', L = en ? 'en' : 'ru';
    var m = document.getElementById('exModal');
    if (!m) { m = document.createElement('div'); m.id = 'exModal'; m.className = 'pro-modal ex-modal'; document.body.appendChild(m); }
    var inPlan = null;
    if (planStore.plan) planStore.plan.days.forEach(function (d) { d.items.forEach(function (it) { if (it.id === id && !inPlan) inPlan = it; }); });
    var tags = [MG[L][x.mg] || x.mg, EQ[L][x.eq], x.compound ? (en ? 'compound' : 'базовое') : (en ? 'isolation' : 'изолирующее')];
    if (x.uni) tags.push(en ? 'each side' : 'на каждую сторону');
    if (x.impact) tags.push(en ? 'jumps' : 'прыжки');
    var cue = en ? '' : (CUES[x.pat[0]] || '');
    m.innerHTML = '';
    var card = h('div', { class: 'pro-modal-card card ex-detail', role: 'dialog', 'aria-modal': 'true', 'aria-label': x[L] || x.ru }, [
      h('div', { class: 'ex-detail-img' }, [h('img', { src: 'img/ex/' + x.id + '.svg?v=7', alt: x[L] || x.ru, width: 480, height: 360 })]),
      h('h2', { text: x[L] || x.ru }),
      h('div', { class: 'ex-tags' }, tags.map(function (tg) { return h('span', { class: 'chip', text: tg }); })),
      inPlan ? h('p', { class: 'ex-plan-line', text: (en ? 'In your plan: ' : 'В твоей программе: ') + (inPlan.sets > 1 ? t('wk.sets', { s: inPlan.sets, r: fmtReps(inPlan) }) : fmtReps(inPlan)) + (inPlan.rest ? ' · ' + t('wk.rest', { v: fmtRest(inPlan.rest) }) : '') }) : null,
      cue ? h('p', { class: 'muted small', text: cue }) : null,
      h('button', { type: 'button', class: 'btn wide', 'data-ex-close': '1', text: en ? 'Close' : 'Закрыть' })
    ].filter(Boolean));
    m.appendChild(card);
    m.hidden = false;
    m.onclick = function (e) { if (e.target === m || e.target.closest('[data-ex-close]')) m.hidden = true; };
  }
  function submitPlan(reshuffle) {
    var fi = formInputs();
    if (!(fi.age >= 10 && fi.age <= 100) || !(fi.weight >= 25 && fi.weight <= 300) || !(fi.height >= 100 && fi.height <= 250)) { toast(t('wk.invalid')); return false; }
    wk.form.age = Math.round(fi.age); wk.form.height = Math.round(fi.height);
    var w = Math.round(fi.weight * 10) / 10, lw = latestWeight();
    if (w !== wk.form.weight || !lw || lw.v !== w) { wk.form.weight = w; wk.form.weightKey = todayKey(); }
    // keep Profile in sync with what was entered here
    if (settings.age !== wk.form.age || settings.height !== wk.form.height) {
      settings.age = wk.form.age; settings.height = wk.form.height; persist();
    }
    var form = JSON.parse(JSON.stringify(wk.form));
    var seed = reshuffle && planStore.plan ? (planStore.plan.seed % 2147483000) + 7919 : 1 + Math.floor(Math.random() * 1e6);
    planStore.plan = generatePlan(form, seed);
    planStore.at = Date.now();
    savePlanStore();
    return true;
  }
  el.wkForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!submitPlan(false)) return;
    renderWorkouts();
    el.wkResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(t('wk.saved'));
  });
  el.wkForm.addEventListener('click', function (e) {
    var s = e.target.closest('[data-sex]');
    if (s) { settings.sex = s.dataset.sex; persist(); renderWorkouts(); return; }
    var b = e.target.closest('[data-wk]');
    if (!b) return;
    wk.form[b.dataset.wk] = b.dataset.v;
    savePlanStore();
    renderWorkouts();
  });
  el.wkForm.addEventListener('input', function (e) { if (e.target.classList.contains('num-input')) renderEnergy(); });
  el.wkActivity.addEventListener('change', function () {
    if (ACTIVITY[el.wkActivity.value]) { settings.activity = el.wkActivity.value; persist(); renderEnergy(); }
  });
  el.wkDaysMinus.addEventListener('click', function () { wk.form.days = Math.max(1, wk.form.days - 1); el.wkDays.textContent = wk.form.days; savePlanStore(); });
  el.wkDaysPlus.addEventListener('click', function () { wk.form.days = Math.min(7, wk.form.days + 1); el.wkDays.textContent = wk.form.days; savePlanStore(); });
  el.wkEnergy.addEventListener('click', function (e) { if (e.target.closest('[data-en-auto]')) setAutoGoal(); });
  document.getElementById('view-workouts').addEventListener('click', function (e) {
    var hs = e.target.closest('[data-hs-start]');
    if (hs) { if (window.HistoryModule) window.HistoryModule.startPlanDay(Number(hs.dataset.hsStart)); return; }
    var lb = e.target.closest('[data-lib-eq]');
    if (lb) { libEq = lb.dataset.libEq; renderExLibrary(); return; }
    var xe = e.target.closest('[data-ex]');
    if (xe) openExercise(xe.dataset.ex);
  });
  document.getElementById('view-workouts').addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li[data-ex]')) { e.preventDefault(); openExercise(e.target.dataset.ex); }
  });
  el.wkResult.addEventListener('click', function (e) {
    if (e.target.closest('[data-wk-regen]')) {
      if (submitPlan(true)) { renderWorkouts(); el.wkResult.scrollIntoView({ behavior: 'smooth', block: 'start' }); toast(t('wk.saved')); }
    }
  });
  // A plan made by the removed AI feature can't be shown by the new renderer: rebuild it offline from the saved form.
  if (planStore.legacy) {
    var lf = planStore.form;
    if (lf.age >= 10 && lf.age <= 100 && lf.weight >= 25 && lf.weight <= 300 && lf.height >= 100 && lf.height <= 250) {
      planStore.plan = generatePlan(lf, 1 + Math.floor(Math.random() * 1e6)); planStore.at = Date.now();
    }
    savePlanStore();
    planStore.legacy = false;
  }

  // ======================================================================
  // v7: read-only bridge for the AI assistant (ai.js)
  // ======================================================================
  window.HTApp = {
    settings: function () { return settings; },
    data: function () { return store.data; },
    food: function () { return food; },
    plan: function () { return planStore; },
    todayKey: todayKey, toKey: toKey, parseKey: parseKey, addDays: addDays, today: today,
    kcalGoal: kcalGoal, macroTargets: macroTargets, foodTotals: foodTotals, entryName: entryName,
    isPro: isPro,
    // v8: used by the AI assistant (nutrition lookup, photo recognition, norms)
    searchFoods: searchFoods, foodById: function (id) { return FOOD_BY_ID[id] || null; }, portionOf: portionOf,
    energy: function () { return profileEnergy(); },
    weight: function () { return currentWeight() || null; },
    profile: function () { return { age: settings.age || wk.form.age || null, sex: settings.sex || null, height: settings.height || wk.form.height || null, activity: settings.activity, goal: wk.form.goal || 'general' }; },
    // add to TODAY's diary: { fid, g } for a database food, or { name, g, kcal, p, f, c } for a custom one
    addFood: function (x) {
      var f = x.fid && FOOD_BY_ID[x.fid], g = Math.round(Number(x.g) || 0), entry;
      if (f) { if (!(g >= 1 && g <= 3000)) g = f.por || 100; var v = portionOf(f, g); entry = { fid: f.id, name: f.ru, g: g, kcal: v.kcal, p: v.p, f: v.f, c: v.c }; }
      else {
        if (!x.name) return null;
        entry = { name: String(x.name).slice(0, 120), kcal: Math.max(0, Math.round(Number(x.kcal) || 0)), p: r1(Math.max(0, Number(x.p) || 0)), f: r1(Math.max(0, Number(x.f) || 0)), c: r1(Math.max(0, Number(x.c) || 0)) };
        if (g >= 1 && g <= 3000) entry.g = g;
      }
      var k = todayKey();
      entry.id = uid(); entry.at = Date.now();
      (food[k] = food[k] || []).push(entry);
      saveFood();
      if (state.view === 'food' || state.view === 'today') render();
      return entry;
    },
    toast: function (m) { toast(m); },
    // v9.4: the ring's goals for «Сегодня» (same rule as the ring) → { ids, done: [ids], missing: [ids], food: entries today }
    ringStatus: function () {
      var ids = GOAL_IDS.filter(metricOn), done = [], missing = [];
      ids.forEach(function (id) { var v = get(id, defaultKey(id)); if (v !== null && meetsGoal(id, v)) done.push(id); else missing.push(id); });
      return { ids: ids, done: done, missing: missing, food: (food[todayKey()] || []).length, goalOf: function (id) { return goalOf(id); }, val: function (id) { return get(id, defaultKey(id)); } };
    },
    // v8: used by history.js
    exercises: function () { return EXERCISES; }, exById: function (id) { return EX_BY_ID[id] || null; }, fmtReps: fmtReps,
    dayTitle: function (d) { var tp = TPL[d.tpl] || { f: 'fb', s: '' }; return t('wk.f.' + tp.f) + (tp.s ? ' ' + tp.s : ''); },
    // a finished/removed history workout adjusts the daily «Тренировка» minutes
    addWorkoutMinutes: function (k, delta) {
      if (!isValidKey(k) || !delta) return;
      var m = METRICS.workout, v = (get('workout', k) || 0) + delta;
      if (v <= 0) delete store.data.workout[k];
      else store.data.workout[k] = Math.min(m.max, Math.round(v));
      persist();
    },
    // v9: used by v9.js (next task, goals, weekly summary, sleep times, measurements, food speed)
    dayMinutes: dayMinutes,
    setMetric: function (id, k, v) {
      var m = METRICS[id]; if (!m || !isValidKey(k)) return;
      if (v === null || v === undefined || v === '') delete store.data[id][k];
      else { v = Number(v); if (!isFinite(v)) return; store.data[id][k] = Math.max(m.min, Math.min(m.max, v)); }
      persist();
    },
    rerender: function () { var y = window.scrollY; render(); window.scrollTo(0, y); },
    view: function () { return state.view; },
    saveFood: function () { saveFood(); },
    uid: function () { return uid(); },
    metric: function (id) { return METRICS[id] || null; },
    foodDay: function () { return foodDay(); }, dayLabel: function (k) { return dayLabel(k); },
    addEntry: function (e, k) {   // v9.2: add a diary entry (to the day open on the food screen, or k)
      var x = { name: String(e.name || '').slice(0, 120), kcal: Math.max(0, Math.round(Number(e.kcal) || 0)), p: r1(Number(e.p) || 0), f: r1(Number(e.f) || 0), c: r1(Number(e.c) || 0) };
      if (e.fid && FOOD_BY_ID[e.fid]) x.fid = e.fid;
      if (e.g >= 1 && e.g <= 5000) x.g = Math.round(e.g);
      if (e.fib !== undefined && e.fib !== null && isFinite(Number(e.fib))) x.fib = r1(Number(e.fib));
      if (typeof e.bc === 'string' && /^\d{6,14}$/.test(e.bc)) x.bc = e.bc;
      var day = k && isValidKey(k) ? k : foodDay();
      x.id = uid(); x.at = Date.now();
      (food[day] = food[day] || []).push(x);
      return x;
    },
    afterFoodChange: function (msg) { saveFood(); if (msg) toast(msg); if (state.view === 'food' || state.view === 'today') render(); },
    fmtNum: fmtNum,
    exportJSON: function (o) { exportJSON(o); }
  };

  // ======================================================================
  // Events
  // ======================================================================
  window.addEventListener('hashchange', route);

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-action]');
    if (a) {
      var act = a.dataset.action;
      if (act === 'demo') loadDemo();
      else if (act === 'download') exportJSON();
      else if (act === 'csv') exportCSV();
      else if (act === 'import') el.importFile.click();
      else if (act === 'clear') clearAll();
      return;
    }
    if (e.target.closest('[data-close]')) closeSheets();
  });

  // Today
  el.todayCards.addEventListener('click', function (e) {
    var w = e.target.closest('[data-water]');
    if (w) {
      var k = todayKey(), nv = Math.min(METRICS.water.max, (get('water', k) || 0) + Number(w.dataset.water));
      store.data.water[k] = nv; persist(); renderToday();
      toast('💧 ' + fmtVal('water', nv, true));
      return;
    }
    var md = e.target.closest('[data-mood]');
    if (md) {
      var mv = Number(md.dataset.mood);
      store.data.mood[todayKey()] = mv; persist(); renderToday();
      toast(METRICS.mood.emojis[mv - 1] + ' ' + t('mood.' + mv));
      return;
    }
    var c = e.target.closest('[data-open]');
    if (c) openLog(c.dataset.open);
  });
  el.todayCards.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open]')) { e.preventDefault(); openLog(e.target.dataset.open); }
  });
  el.weekGrid.addEventListener('click', function (e) {
    var b = e.target.closest('.wk-dot');
    if (b && parseKey(b.dataset.key) <= today()) openLog(b.dataset.metric, b.dataset.key);
  });

  // Trends
  el.metricTabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-metric-tab]');
    if (b) go('trends', b.dataset.metricTab);
  });
  el.prevYear.addEventListener('click', function () { if (state.year > MIN_YEAR) { state.year--; renderTrends({ scroll: true }); } });
  el.nextYear.addEventListener('click', function () { if (state.year < maxYear()) { state.year++; renderTrends({ scroll: true }); } });
  el.grid.addEventListener('click', function (e) {
    var b = e.target.closest('.cell');
    if (b && b.dataset.key && !b.disabled) openLog(state.metric, b.dataset.key);
  });
  el.goalMinus.addEventListener('click', function () { changeGoal(state.metric, -1); renderTrends(); });
  el.goalPlus.addEventListener('click', function () { changeGoal(state.metric, 1); renderTrends(); });
  [el.scopeYear, el.scopeAll].forEach(function (b) {
    b.addEventListener('click', function () { state.scope = b.dataset.scope; renderTrends(); });
  });

  // Profile
  document.querySelectorAll('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () { settings.lang = b.dataset.lang; persist(); applyStaticI18n(); render(); });
  });
  el.heightInput.addEventListener('change', function () {
    var raw = el.heightInput.value.trim(), v = parseInputNumber(raw);
    if (raw === '') settings.height = null;
    else if (isFinite(v) && v >= 80 && v <= 250) settings.height = Math.round(v);
    else { el.heightInput.value = settings.height || ''; toast(t('sheet.invalid', { min: 80, max: 250 })); return; }
    persist();
    toast(t('profile.heightSaved'));
  });
  el.ageInput.addEventListener('change', function () {
    var raw = el.ageInput.value.trim(), v = parseInputNumber(raw);
    if (raw === '') settings.age = null;
    else if (isFinite(v) && v >= 10 && v <= 100) settings.age = Math.round(v);
    else { el.ageInput.value = settings.age || ''; toast(t('sheet.invalid', { min: 10, max: 100 })); return; }
    persist();
    toast(t('profile.ageSaved'));
  });
  el.profileSex.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sex]');
    if (b) { settings.sex = b.dataset.sex; persist(); renderProfile(); }
  });
  el.goalsList.addEventListener('click', function (e) {
    var b = e.target.closest('[data-goal]');
    if (b) { changeGoal(b.dataset.goal, Number(b.dataset.dir)); renderProfile(); }
  });
  el.importFile.addEventListener('change', function () {
    var f = el.importFile.files && el.importFile.files[0];
    if (f) importJSON(f);
    el.importFile.value = '';
  });

  // Sheets
  el.addBtn.addEventListener('click', openAdd);
  el.backdrop.addEventListener('click', closeSheets);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeSheets(); var xm = document.getElementById('exModal'); if (xm) xm.hidden = true; }
    if (e.key === 'Enter' && !el.logSheet.hidden && e.target === el.valInput) saveSheet();
  });
  el.addGrid.addEventListener('click', function (e) {
    var b = e.target.closest('[data-add]');
    if (b) openLog(b.dataset.add);
  });
  el.dateInput.addEventListener('change', function () {
    var k = el.dateInput.value;
    if (!isValidKey(k)) return;
    if (parseKey(k) > today()) { el.dateInput.value = state.sheet.key; toast(t('sheet.future')); return; }
    var prev = state.sheet.key;
    state.sheet.key = k;
    refreshCell(state.sheet.id, prev);
    refreshCell(state.sheet.id, k);
    loadSheetValue();
  });
  el.valRange.addEventListener('input', function () { setSheetValue(Number(el.valRange.value)); });
  el.valInput.addEventListener('input', function () {
    var v = parseInputNumber(el.valInput.value);
    if (isFinite(v)) setSheetValue(v, true);
  });
  el.valInput.addEventListener('focus', function () { el.valInput.select(); });
  function stepBy(dir) {
    var m = METRICS[state.sheet.id], st = m.btnStep || m.step;
    var cur = state.sheet.value || 0;
    setSheetValue(dir > 0 ? Math.floor(cur / st + 1e-9) * st + st : Math.ceil(cur / st - 1e-9) * st - st);
  }
  el.valMinus.addEventListener('click', function () { stepBy(-1); });
  el.valPlus.addEventListener('click', function () { stepBy(1); });
  el.chips.addEventListener('click', function (e) {
    var c = e.target.closest('[data-chip]');
    if (!c) return;
    var raw = c.dataset.chip;
    if (raw.charAt(0) === '+') setSheetValue((state.sheet.value || 0) + Number(raw.slice(1)));
    else setSheetValue(Number(raw));
  });
  el.moodInput.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mood-pick]');
    if (b) setSheetValue(Number(b.dataset.moodPick));
  });
  el.saveBtn.addEventListener('click', saveSheet);
  el.clearEntryBtn.addEventListener('click', clearEntry);
  el.historyBtn.addEventListener('click', function () {
    var id = state.sheet.id, k = state.sheet.key;
    closeSheets();
    if (k) state.year = +k.slice(0, 4);
    go('trends', id);
  });

  // Keep tabs in sync; re-render on day rollover
  window.addEventListener('storage', function (e) {
    if (e.key === STORE_KEY) { store = load(); settings = store.settings; applyStaticI18n(); render(); }
    else if (e.key === FOOD_KEY) { food = sanitizeFood(readJSON(FOOD_KEY, {})); render(); }
  });
  var lastDay = todayKey();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && todayKey() !== lastDay) { lastDay = todayKey(); render({ scroll: true }); }
  });

  // PWA install
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); state.deferredInstall = e; el.installBtn.hidden = false; if (state.view === 'today' && window.V9) window.V9.renderTodayTop(); });
  el.installBtn.addEventListener('click', function () {
    var p = state.deferredInstall;
    if (!p) return;
    p.prompt();
    p.userChoice.finally(function () { state.deferredInstall = null; el.installBtn.hidden = true; });
  });
  window.addEventListener('appinstalled', function () { el.installBtn.hidden = true; toast(t('data.installed')); });
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && !isStandalone) el.iosHint.hidden = false;

  // Init
  if (window.HTPro) window.HTPro.onChange(function () { render(); });
  applyStaticI18n();
  route();
  try { if (sessionStorage.getItem('ht-cleared')) { sessionStorage.removeItem('ht-cleared'); toast(t('data.cleared')); } } catch (e) { /* */ }
})();
