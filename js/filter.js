/* ============================================================
   TRUE VANILLA - filter.js
   Liste de base de l'auto-modération, générée depuis filter.yml.
   Deux formats :
     - RX    : expressions régulières (IP, URL, domaines…)
     - WORDS : mots simples, comparés de façon « floue »
               (accents, leet-speak, lettres répétées, espaces).
   Les mots ajoutés par le staff depuis le panneau sont stockés
   dans la table Supabase « filter_words » et viennent s'ajouter
   à cette liste au chargement de la page.
   ============================================================ */

window.TV_FILTER = {
  RX: [
    "(?<![\\w.])(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}(?::\\d{1,5}|/\\S*)(?![\\w.])",
    "(?<!\\w)https?://\\S+",
    "(?<!\\w)www\\.\\S+",
    "(?<![\\w.])(?:[a-zA-Z0-9-]+\\.)+(?:com|net|org|fr|gg|io|club|xyz|tv|live|me|us|co|uk|eu|de|es|it|nl|ru|info|biz|online|shop|app|mc|world|games|gaming|host|sg|pw|cc|cf|ga|tk)(?::\\d{1,5})?(?:/\\S*)?(?!\\w)",
  ],
  WORDS: [
    "pvpclub", "minemen", "hyping", "hypixel", "mineplex", "cubecraft",
    "jartex", "mineland", "universocraft", "cubeville", "manacube", "skywars",
    "bedwars", "leftcraft", "ntm", "ntmm", "ntmr", "ntmre",
    "ntmere", "ntgm", "ntgrm", "ntgrmr", "ntgrmre", "ntr",
    "ntmd", "vtf", "vtff", "vtfr", "vtfoutre", "btm",
    "btg", "tdr", "ptn", "ptdn", "fdp", "trdbl",
    "trdb", "fdps", "fdpe", "fdpss", "niktamer", "niktamere",
    "niktagm", "niketamere", "vatefairefoutre", "nique", "niquer", "niqueur",
    "nikmouk", "niquetamer", "niquetamere", "niquetarace", "niquetagm", "niquetagmere",
    "niquetagrandmere", "niquetagrandemere", "tamer", "tamere", "tarace", "tesmorts",
    "tesmor", "filsdepute", "filsdeput", "filsdp", "hijodeputa", "hijodeputo",
    "pute", "putain", "salope", "salopard", "salopiaud", "pétasse",
    "pouffiasse", "pouffe", "garce", "encule", "enculer", "enculeur",
    "slp", "cnrd", "enculade", "enculerie", "connard", "connasse",
    "bâtard", "pédé", "pédale", "tapette", "tarlouze", "tarlouse",
    "gouine", "foutre", "foutrais", "foutraison", "enfoiré", "enfoire",
    "chiennasse", "negro", "hitler", "nazi", "nègre", "négresse",
    "bougnoule", "bougnoul", "bicot", "raton", "crouille", "chinetoque",
    "bamboula", "youpin", "youpine", "niakoué", "niakoue", "macaque",
    "renoi", "travelo", "folasse", "bite", "couille", "zizi",
    "teub", "chibre", "pénis", "penis", "testicule", "scrotum",
    "vagin", "vulve", "clitoris", "anus", "sucette", "branler",
    "branleur", "branlette", "masturber", "masturbation", "éjaculer", "éjaculation",
    "pipe", "pompier", "pompe", "fuck", "fucker", "fucking",
    "fucked", "motherfucker", "mf", "mfer", "clusterfuck", "shit",
    "shitty", "shithead", "shitbag", "bullshit", "horseshit", "bitch",
    "bitches", "bitching", "sonofabitch", "cunt", "cunty", "whore",
    "slut", "hoe", "bastard", "asshole", "arsehole", "jackass",
    "dumbass", "asshat", "dyke", "tranny", "nigger", "nigga",
    "niglet", "chink", "spic", "wetback", "kike", "towelhead",
    "raghead", "dick", "dickhead", "cock", "cocksucker", "pussy",
    "tits", "titties", "vagina", "penis", "testicle", "testicles",
    "ballsack", "bollocks", "blowjob", "handjob", "rimjob", "jizz",
    "cum", "cumshot", "wanker", "wank", "cazzo", "cazzi",
    "cazzata", "incazzato", "vaffanculo", "affanculo", "stronzo", "stronza",
    "stronzi", "stronzata", "troia", "puttana", "puttaniere", "figa",
    "fica", "fregna", "merda", "coglione", "coglioni", "frocio",
    "ricchione", "bastardo", "zoccola", "mignotta", "porcodio", "dioporco",
    "culattone", "scopare", "pompino", "sborra", "inculare", "scheisse",
    "scheiße", "scheiss", "scheiß", "scheißer", "scheisser", "ficken",
    "ficker", "gefickt", "fotze", "arschloch", "arschgesicht", "hurensohn",
    "hurentochter", "nutte", "schlampe", "hure", "wichser", "wichsen",
    "schwanz", "schwuchtel", "schwanzlutscher", "spast", "spasti", "mongo",
    "mongoloid", "neger", "kanake", "kacken", "kackwurst", "titten",
    "muschi", "pimmel", "puta", "puto", "putas", "mierda",
    "coño", "joder", "jodido", "jodida", "cabrón", "cabron",
    "cabrones", "cabrona", "pendejo", "pendeja", "gilipollas", "maricón",
    "maricon", "marica", "maricones", "polla", "verga", "vergudo",
    "chingar", "chingada", "chingado", "chingue", "culero", "culera",
    "zorra", "zorrita", "concha", "conchuda", "hijoputa", "hijoeputa",
    "cojones", "cojón", "mamón", "mamon", "mamada", "follar",
    "follador", "tetas", "tetona", "pinga",
  ],
};
