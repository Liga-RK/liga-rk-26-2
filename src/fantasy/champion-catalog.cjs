"use strict";

const CHAMPION_IDS = "Aatrox Ahri Akali Akshan Alistar Ambessa Amumu Anivia Annie Aphelios Ashe AurelionSol Aurora Azir Bard Belveth Blitzcrank Brand Braum Briar Caitlyn Camille Cassiopeia Chogath Corki Darius Diana Draven DrMundo Ekko Elise Evelynn Ezreal Fiddlesticks Fiora Fizz Galio Gangplank Garen Gnar Gragas Graves Gwen Hecarim Heimerdinger Hwei Illaoi Irelia Ivern Janna JarvanIV Jax Jayce Jhin Jinx Kaisa Kalista Karma Karthus Kassadin Katarina Kayle Kayn Kennen Khazix Kindred Kled KogMaw KSante Leblanc LeeSin Leona Lillia Lissandra Locke Lucian Lulu Lux Malphite Malzahar Maokai MasterYi Mel Milio MissFortune MonkeyKing Mordekaiser Morgana Naafiri Nami Nasus Nautilus Neeko Nidalee Nilah Nocturne Nunu Olaf Orianna Ornn Pantheon Poppy Pyke Qiyana Quinn Rakan Rammus RekSai Rell Renata Renekton Rengar Riven Rumble Ryze Samira Sejuani Senna Seraphine Sett Shaco Shen Shyvana Singed Sion Sivir Skarner Smolder Sona Soraka Swain Sylas Syndra TahmKench Taliyah Talon Taric Teemo Thresh Tristana Trundle Tryndamere TwistedFate Twitch Udyr Urgot Varus Vayne Veigar Velkoz Vex Vi Viego Viktor Vladimir Volibear Warwick Xayah Xerath XinZhao Yasuo Yone Yorick Yunara Yuumi Zaahen Zac Zed Zeri Ziggs Zilean Zoe Zyra".split(" ");

const SPECIAL_NAMES = Object.freeze({
  AurelionSol: "Aurelion Sol",
  Bard: "Bardo",
  Belveth: "Bel'Veth",
  Chogath: "Cho'Gath",
  DrMundo: "Dr. Mundo",
  JarvanIV: "Jarvan IV",
  Kaisa: "Kai'Sa",
  Khazix: "Kha'Zix",
  KogMaw: "Kog'Maw",
  KSante: "K'Sante",
  Leblanc: "LeBlanc",
  LeeSin: "Lee Sin",
  MasterYi: "Master Yi",
  MissFortune: "Miss Fortune",
  MonkeyKing: "Wukong",
  RekSai: "Rek'Sai",
  TahmKench: "Tahm Kench",
  TwistedFate: "Twisted Fate",
  XinZhao: "Xin Zhao"
});

const CHAMPION_CATALOG = Object.freeze(CHAMPION_IDS.map((id) => Object.freeze({
  id,
  name: SPECIAL_NAMES[id] || id.replace(/([a-z0-9])([A-Z])/g, "$1 $2"),
  image: `assets/champions/${id}.png`
})));

module.exports = { CHAMPION_CATALOG, CHAMPION_IDS, SPECIAL_NAMES };
