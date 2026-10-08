/* Здоровье / Health — built-in offline exercise library (no network, no API).
 * Row: [id, name RU, name EN, patterns, equipment, flags, muscle group]
 *   equipment: 'bw' bodyweight (no equipment) · 'home' dumbbells / bands / bar at home · 'gym' machines, barbell, cables
 *   patterns:  squat hinge lunge push_h push_v pull_h pull_v delt rear_delt chest_iso biceps triceps
 *              calves quad_iso ham_iso glute core back_ext cardio mobility warmup
 *   flags:     c = compound · s = timed in seconds · m = timed in minutes · i = high-impact (jumps)
 *              u = per side · b = beginner-only variant · a = not for beginners · x = advanced only
 */
(function (root) {
  'use strict';
  var ROWS = [
    // ----- warm-up / mobility -----
    ['warmup', 'Разминка: суставы + лёгкое кардио', 'Warm-up: joint circles + light cardio', ['warmup'], 'bw', 'm', 'full'],
    ['cat_cow', '«Кошка-корова»', 'Cat-cow', ['mobility'], 'bw', '', 'back'],
    ['hip_stretch', 'Растяжка сгибателей бедра в выпаде', 'Hip flexor lunge stretch', ['mobility'], 'bw', 'su', 'legs'],
    ['stretch', 'Растяжка всего тела', 'Full-body stretching', ['mobility'], 'bw', 'm', 'full'],
    // ----- squat -----
    ['air_squat', 'Приседания с весом тела', 'Bodyweight squat', ['squat'], 'bw', 'c', 'legs'],
    ['wall_sit', 'Стульчик у стены', 'Wall sit', ['squat'], 'bw', 'sb', 'legs'],
    ['jump_squat', 'Приседания с выпрыгиванием', 'Jump squat', ['squat', 'cardio'], 'bw', 'cia', 'legs'],
    ['goblet_squat', 'Гоблет-присед с гантелью', 'Goblet squat', ['squat'], 'home', 'c', 'legs'],
    ['back_squat', 'Приседания со штангой', 'Barbell back squat', ['squat'], 'gym', 'ca', 'legs'],
    ['leg_press', 'Жим ногами в тренажёре', 'Leg press', ['squat'], 'gym', 'c', 'legs'],
    // ----- hinge / glutes -----
    ['glute_bridge', 'Ягодичный мост', 'Glute bridge', ['hinge', 'glute'], 'bw', 'c', 'glutes'],
    ['single_leg_bridge', 'Ягодичный мост на одной ноге', 'Single-leg glute bridge', ['glute', 'hinge'], 'bw', 'ua', 'glutes'],
    ['db_rdl', 'Румынская тяга с гантелями', 'Dumbbell Romanian deadlift', ['hinge'], 'home', 'c', 'hamstrings'],
    ['kb_swing', 'Махи гирей / гантелью', 'Kettlebell / dumbbell swing', ['hinge', 'cardio'], 'home', 'ca', 'glutes'],
    ['rdl', 'Румынская тяга со штангой', 'Barbell Romanian deadlift', ['hinge'], 'gym', 'c', 'hamstrings'],
    ['deadlift', 'Становая тяга', 'Deadlift', ['hinge'], 'gym', 'cx', 'back'],
    ['hip_thrust', 'Ягодичный мост со штангой', 'Barbell hip thrust', ['glute', 'hinge'], 'gym', 'c', 'glutes'],
    ['back_extension', 'Гиперэкстензия', 'Back extension', ['back_ext', 'hinge'], 'gym', '', 'back'],
    ['superman', '«Супермен» лёжа на животе', 'Superman hold', ['back_ext', 'pull_v'], 'bw', '', 'back'],
    // ----- lunge / single-leg -----
    ['reverse_lunge', 'Обратные выпады', 'Reverse lunge', ['lunge'], 'bw', 'cu', 'legs'],
    ['split_squat', 'Болгарские сплит-приседания', 'Bulgarian split squat', ['lunge'], 'bw', 'cua', 'legs'],
    ['db_lunge', 'Выпады с гантелями', 'Dumbbell lunges', ['lunge'], 'home', 'cu', 'legs'],
    ['step_up', 'Зашагивания на скамью с гантелями', 'Dumbbell step-ups', ['lunge'], 'home', 'cu', 'legs'],
    ['leg_ext', 'Разгибание ног в тренажёре', 'Leg extension', ['quad_iso'], 'gym', '', 'quads'],
    ['leg_curl', 'Сгибание ног в тренажёре', 'Leg curl', ['ham_iso'], 'gym', '', 'hamstrings'],
    ['calf_raise', 'Подъёмы на носки', 'Calf raises', ['calves'], 'bw', '', 'calves'],
    // ----- horizontal push -----
    ['incline_pushup', 'Отжимания от опоры (стол/скамья)', 'Incline push-ups', ['push_h'], 'bw', 'cb', 'chest'],
    ['knee_pushup', 'Отжимания с колен', 'Knee push-ups', ['push_h'], 'bw', 'cb', 'chest'],
    ['pushup', 'Отжимания', 'Push-ups', ['push_h'], 'bw', 'ca', 'chest'],
    ['decline_pushup', 'Отжимания с ногами на опоре', 'Decline push-ups', ['push_h', 'push_v'], 'bw', 'cx', 'chest'],
    ['db_bench', 'Жим гантелей лёжа', 'Dumbbell bench press', ['push_h'], 'home', 'c', 'chest'],
    ['bench_press', 'Жим штанги лёжа', 'Barbell bench press', ['push_h'], 'gym', 'ca', 'chest'],
    ['incline_db_press', 'Жим гантелей на наклонной скамье', 'Incline dumbbell press', ['push_h'], 'gym', 'c', 'chest'],
    ['chest_press', 'Жим от груди в тренажёре', 'Machine chest press', ['push_h'], 'gym', 'cb', 'chest'],
    ['cable_fly', 'Сведение рук в кроссовере', 'Cable chest fly', ['chest_iso'], 'gym', '', 'chest'],
    ['dips', 'Отжимания на брусьях', 'Parallel bar dips', ['push_h', 'triceps'], 'gym', 'cx', 'chest'],
    // ----- vertical push / shoulders -----
    ['pike_pushup', 'Отжимания «пайк» (плечи)', 'Pike push-ups', ['push_v'], 'bw', 'c', 'shoulders'],
    ['db_ohp', 'Жим гантелей стоя/сидя', 'Dumbbell overhead press', ['push_v'], 'home', 'c', 'shoulders'],
    ['ohp', 'Жим штанги стоя', 'Barbell overhead press', ['push_v'], 'gym', 'ca', 'shoulders'],
    ['machine_shoulder', 'Жим на плечи в тренажёре', 'Machine shoulder press', ['push_v'], 'gym', 'cb', 'shoulders'],
    ['lateral_raise', 'Махи гантелями в стороны', 'Dumbbell lateral raises', ['delt'], 'home', '', 'shoulders'],
    ['ytw', 'Подъёмы рук Y-T-W лёжа на животе', 'Prone Y-T-W raises', ['rear_delt', 'delt'], 'bw', '', 'shoulders'],
    ['band_pull_apart', 'Разведение резинки перед грудью', 'Band pull-aparts', ['rear_delt'], 'home', '', 'shoulders'],
    ['face_pull', 'Тяга каната к лицу', 'Cable face pull', ['rear_delt'], 'gym', '', 'shoulders'],
    // ----- pulls -----
    ['inverted_row', 'Австралийские подтягивания (под столом/перекладиной)', 'Inverted rows', ['pull_h'], 'bw', 'c', 'back'],
    ['db_row', 'Тяга гантели в наклоне', 'One-arm dumbbell row', ['pull_h'], 'home', 'cu', 'back'],
    ['barbell_row', 'Тяга штанги в наклоне', 'Barbell bent-over row', ['pull_h'], 'gym', 'ca', 'back'],
    ['cable_row', 'Тяга горизонтального блока', 'Seated cable row', ['pull_h'], 'gym', 'c', 'back'],
    ['band_pulldown', 'Тяга резинки сверху к груди', 'Band lat pulldown', ['pull_v'], 'home', 'c', 'back'],
    ['pullup', 'Подтягивания на турнике', 'Pull-ups', ['pull_v'], 'home', 'cx', 'back'],
    ['lat_pulldown', 'Тяга верхнего блока', 'Lat pulldown', ['pull_v'], 'gym', 'c', 'back'],
    ['assisted_pullup', 'Подтягивания в гравитроне', 'Assisted pull-ups', ['pull_v'], 'gym', 'c', 'back'],
    // ----- arms -----
    ['db_curl', 'Сгибание рук с гантелями', 'Dumbbell biceps curl', ['biceps'], 'home', '', 'arms'],
    ['hammer_curl', 'Сгибание рук «молот»', 'Hammer curl', ['biceps'], 'home', '', 'arms'],
    ['barbell_curl', 'Подъём штанги на бицепс', 'Barbell curl', ['biceps'], 'gym', '', 'arms'],
    ['bench_dips', 'Обратные отжимания от стула', 'Bench dips', ['triceps'], 'bw', '', 'arms'],
    ['diamond_pushup', 'Отжимания узким хватом', 'Close-grip (diamond) push-ups', ['triceps'], 'bw', 'a', 'arms'],
    ['db_overhead_ext', 'Французский жим гантели из-за головы', 'Overhead dumbbell triceps extension', ['triceps'], 'home', '', 'arms'],
    ['triceps_pushdown', 'Разгибание рук на блоке', 'Cable triceps pushdown', ['triceps'], 'gym', '', 'arms'],
    // ----- core -----
    ['plank', 'Планка', 'Plank', ['core'], 'bw', 's', 'core'],
    ['side_plank', 'Боковая планка', 'Side plank', ['core'], 'bw', 'su', 'core'],
    ['dead_bug', '«Мёртвый жук»', 'Dead bug', ['core'], 'bw', 'u', 'core'],
    ['bird_dog', '«Птица-собака»', 'Bird dog', ['core'], 'bw', 'u', 'core'],
    ['crunch', 'Скручивания', 'Crunches', ['core'], 'bw', '', 'core'],
    ['leg_raise', 'Подъём ног лёжа', 'Lying leg raises', ['core'], 'bw', 'a', 'core'],
    ['russian_twist', 'Русские скручивания', 'Russian twists', ['core'], 'bw', 'a', 'core'],
    ['ab_wheel', 'Ролик для пресса', 'Ab wheel rollout', ['core'], 'home', 'x', 'core'],
    ['hanging_leg_raise', 'Подъём ног в висе', 'Hanging leg raise', ['core'], 'gym', 'x', 'core'],
    // ----- cardio / conditioning -----
    ['brisk_walk', 'Быстрая ходьба', 'Brisk walk', ['cardio'], 'bw', 'm', 'cardio'],
    ['mountain_climbers', 'Скалолаз', 'Mountain climbers', ['cardio'], 'bw', 's', 'cardio'],
    ['jumping_jacks', 'Прыжки «джампинг-джек»', 'Jumping jacks', ['cardio'], 'bw', 'si', 'cardio'],
    ['high_knees', 'Бег на месте с высоким подниманием колен', 'High knees', ['cardio'], 'bw', 'si', 'cardio'],
    ['burpees', 'Бёрпи', 'Burpees', ['cardio'], 'bw', 'ia', 'cardio'],
    ['jump_rope', 'Скакалка', 'Jump rope', ['cardio'], 'home', 'si', 'cardio'],
    ['bike', 'Велотренажёр', 'Stationary bike', ['cardio'], 'gym', 'm', 'cardio'],
    ['rower', 'Гребной тренажёр', 'Rowing machine', ['cardio'], 'gym', 'm', 'cardio'],
    ['incline_walk', 'Ходьба в горку на дорожке', 'Incline treadmill walk', ['cardio'], 'gym', 'm', 'cardio']
  ];

  root.HEALTH_EXERCISES = ROWS.map(function (r) {
    var fl = r[5];
    return {
      id: r[0], ru: r[1], en: r[2], pat: r[3], eq: r[4], mg: r[6],
      compound: fl.indexOf('c') >= 0, secs: fl.indexOf('s') >= 0, mins: fl.indexOf('m') >= 0,
      impact: fl.indexOf('i') >= 0, uni: fl.indexOf('u') >= 0,
      // level range (0 beginner, 1 intermediate, 2 advanced)
      lvMin: fl.indexOf('x') >= 0 ? 2 : fl.indexOf('a') >= 0 ? 1 : 0,
      lvMax: fl.indexOf('b') >= 0 ? 0 : 2
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
