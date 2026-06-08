/*
  Edite os dados do campeonato aqui.
  As páginas elite.html e ascensao.html usam estes objetos automaticamente.
*/
const LIGA_RK_ROSTER_TEMPLATE = [
  { lane: "TOP", player: "JOGADOR", opgg: "" },
  { lane: "JG", player: "JOGADOR", opgg: "" },
  { lane: "MID", player: "JOGADOR", opgg: "" },
  { lane: "ADC", player: "JOGADOR", opgg: "" },
  { lane: "SUP", player: "JOGADOR", opgg: "" },
  { lane: "SUB", player: "JOGADOR", opgg: "" },
  { lane: "SUB", player: "JOGADOR", opgg: "" },
  { lane: "SUB", player: "JOGADOR", opgg: "" }
];

const LIGA_RK_DEFAULT_CHAMPION_IMAGE = "assets/champions/Aatrox.jpg";

function createPlaceholderStatistics() {
  return {
    mostPicked: {
      title: "MAIS ESCOLHAS",
      champion: "AATROX",
      value: 0,
      image: LIGA_RK_DEFAULT_CHAMPION_IMAGE
    },
    mostWins: {
      title: "MAIS VITÓRIAS",
      champion: "AATROX",
      value: 0,
      image: LIGA_RK_DEFAULT_CHAMPION_IMAGE
    },
    playerStats: [
      { label: "MELHOR KDA", player: "JOGADOR", value: "00.00" },
      { label: "MELHOR KP", player: "JOGADOR", value: "00.00" },
      { label: "MELHOR DPM", player: "JOGADOR", value: "00.00" },
      { label: "MELHOR GPM", player: "JOGADOR", value: "00.00" },
      { label: "MELHOR VS", player: "JOGADOR", value: "00.00" }
    ]
  };
}

function createPlaceholderTeams(count, captainIndex) {
  return Array.from({ length: count }, () => ({
    name: "NOME DO TIME",
    logo: "",
    players: LIGA_RK_ROSTER_TEMPLATE.map((player, index) => ({
      ...player,
      captain: index === captainIndex
    }))
  }));
}

window.LIGA_RK_DATA = {
  elite: {
    label: "DIVISÃO ELITE",
    shortLabel: "ELITE",
    calendarTitle: "CALENDÁRIO ELITE",
    groupsTitle: "GRUPOS ELITE",
    playoffsTitle: "PLAYOFFS ELITE",
    teamsTitle: "EQUIPES ELITE",
    vodsTitle: "VODS ELITE",
    updateText: "ATUALIZAÇÃO TODA SEGUNDA",
    weeklyHighlight: "MID",
    weeklySelection: [
      { role: "TOP", player: "JOGADOR", team: "EQUIPE", image: "" },
      { role: "JG", player: "JOGADOR", team: "EQUIPE", image: "" },
      { role: "MID", player: "JOGADOR", team: "EQUIPE", image: "" },
      { role: "ADC", player: "JOGADOR", team: "EQUIPE", image: "" },
      { role: "SUP", player: "JOGADOR", team: "EQUIPE", image: "" }
    ],
    mvp: { player: "JOGADOR" },
    rounds: [
      {
        name: "RODADA 1",
        date: "26/07",
        games: [
          ["16:00", "A1", "A2"],
          ["16:00", "A3", "A4"],
          ["17:30", "B1", "B2"],
          ["17:30", "B3", "B4"],
          ["19:00", "C1", "C2"],
          ["19:00", "C3", "C4"],
          ["20:30", "D1", "D2"],
          ["20:30", "D3", "D4"]
        ]
      },
      {
        name: "RODADA 2",
        date: "02/08",
        games: [
          ["16:00", "A1", "A3"],
          ["16:00", "A2", "A4"],
          ["17:30", "B1", "B3"],
          ["17:30", "B2", "B4"],
          ["19:00", "C1", "C3"],
          ["19:00", "C2", "C4"],
          ["20:30", "D1", "D3"],
          ["20:30", "D2", "D4"]
        ]
      },
      {
        name: "RODADA 3",
        date: "09/08",
        games: [
          ["16:00", "A2", "A3"],
          ["16:00", "A4", "A1"],
          ["17:30", "B2", "B3"],
          ["17:30", "B4", "B1"],
          ["19:00", "C2", "C3"],
          ["19:00", "C4", "C1"],
          ["20:30", "D2", "D3"],
          ["20:30", "D4", "D1"]
        ]
      }
    ],
    groups: [
      {
        name: "GRUPO A",
        teams: [
          { name: "A1", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "A2", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "A3", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "A4", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" }
        ]
      },
      {
        name: "GRUPO B",
        teams: [
          { name: "B1", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "B2", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "B3", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "B4", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" }
        ]
      },
      {
        name: "GRUPO C",
        teams: [
          { name: "C1", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "C2", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "C3", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "C4", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" }
        ]
      },
      {
        name: "GRUPO D",
        teams: [
          { name: "D1", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "D2", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "D3", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "D4", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" }
        ]
      }
    ],
    playoffs: [
      [
        { title: "OITAVAS 1", date: "16/08", time: "14:00", format: "MD3", teamA: "C2", teamB: "D3" },
        { title: "OITAVAS 2", date: "16/08", time: "16:30", format: "MD3", teamA: "D2", teamB: "C3" },
        { title: "OITAVAS 3", date: "16/08", time: "19:00", format: "MD3", teamA: "A2", teamB: "B3" },
        { title: "OITAVAS 4", date: "16/08", time: "21:30", format: "MD3", teamA: "B2", teamB: "A3" }
      ],
      [
        { title: "QUARTAS 1", date: "23/08", time: "14:00", format: "MD3", teamA: "A1", teamB: "VENCEDOR OITAVAS 1" },
        { title: "QUARTAS 2", date: "23/08", time: "16:30", format: "MD3", teamA: "B1", teamB: "VENCEDOR OITAVAS 2" },
        { title: "QUARTAS 3", date: "23/08", time: "19:00", format: "MD3", teamA: "C1", teamB: "VENCEDOR OITAVAS 3" },
        { title: "QUARTAS 4", date: "23/08", time: "21:30", format: "MD3", teamA: "D1", teamB: "VENCEDOR OITAVAS 4" }
      ],
      [
        { title: "SEMIS 1", date: "30/08", time: "15:00", format: "MD5", teamA: "VENCEDOR QUARTAS 1", teamB: "VENCEDOR QUARTAS 2" },
        { title: "SEMIS 2", date: "30/08", time: "19:00", format: "MD5", teamA: "VENCEDOR QUARTAS 3", teamB: "VENCEDOR QUARTAS 4" }
      ],
      [
        { title: "GRANDE FINAL", date: "06/09", time: "17:30", format: "MD5", teamA: "VENCEDOR SEMI 1", teamB: "VENCEDOR SEMI 2" }
      ]
    ],
    teams: createPlaceholderTeams(16, 1),
    vod: {
      title: "TIME A X TIME B - R1 GRUPO A",
      url: "",
      thumbnail: ""
    },
    vods: [
      {
        title: "",
        url: "",
        thumbnail: ""
      }
    ],
    statistics: createPlaceholderStatistics()
  },
  ascension: {
    label: "DIVISÃO ASCENSÃO",
    shortLabel: "ASCENSÃO",
    calendarTitle: "CALENDÁRIO ASCENSÃO",
    groupsTitle: "GRUPOS ASCENSÃO",
    playoffsTitle: "PLAYOFFS ASCENSÃO",
    teamsTitle: "EQUIPES ASCENSÃO",
    vodsTitle: "VODS ASCENSÃO",
    updateText: "ATUALIZAÇÃO TODA SEGUNDA",
    weeklyHighlight: "MID",
    weeklySelection: [
      { role: "TOP", player: "JOGADOR", team: "EQUIPE", image: "" },
      { role: "JG", player: "JOGADOR", team: "EQUIPE", image: "" },
      { role: "MID", player: "JOGADOR", team: "EQUIPE", image: "" },
      { role: "ADC", player: "JOGADOR", team: "EQUIPE", image: "" },
      { role: "SUP", player: "JOGADOR", team: "EQUIPE", image: "" }
    ],
    mvp: { player: "JOGADOR" },
    rounds: [
      {
        name: "RODADA 1",
        date: "25/07",
        games: [
          ["16:00", "A1", "A2"],
          ["16:00", "A3", "A4"],
          ["17:30", "B1", "B2"],
          ["17:30", "B3", "B4"],
          ["19:00", "C1", "C2"],
          ["19:00", "C3", "C4"],
          ["20:30", "D1", "D2"],
          ["20:30", "D3", "D4"]
        ]
      },
      {
        name: "RODADA 2",
        date: "01/08",
        games: [
          ["16:00", "A1", "A3"],
          ["16:00", "A2", "A4"],
          ["17:30", "B1", "B3"],
          ["17:30", "B2", "B4"],
          ["19:00", "C1", "C3"],
          ["19:00", "C2", "C4"],
          ["20:30", "D1", "D3"],
          ["20:30", "D2", "D4"]
        ]
      },
      {
        name: "RODADA 3",
        date: "08/08",
        games: [
          ["16:00", "A2", "A3"],
          ["16:00", "A4", "A1"],
          ["17:30", "B2", "B3"],
          ["17:30", "B4", "B1"],
          ["19:00", "C2", "C3"],
          ["19:00", "C4", "C1"],
          ["20:30", "D2", "D3"],
          ["20:30", "D4", "D1"]
        ]
      }
    ],
    groups: [
      {
        name: "GRUPO A",
        teams: [
          { name: "A1", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "A2", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "A3", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "A4", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" }
        ]
      },
      {
        name: "GRUPO B",
        teams: [
          { name: "B1", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "B2", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "B3", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "B4", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" }
        ]
      },
      {
        name: "GRUPO C",
        teams: [
          { name: "C1", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "C2", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "C3", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "C4", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" }
        ]
      },
      {
        name: "GRUPO D",
        teams: [
          { name: "D1", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "D2", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "D3", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" },
          { name: "D4", wins: 0, losses: 0, games: 0, avgWinTime: "00:00" }
        ]
      }
    ],
    playoffs: [
      [
        { title: "OITAVAS 1", date: "15/08", time: "14:00", format: "MD3", teamA: "C2", teamB: "D3" },
        { title: "OITAVAS 2", date: "15/08", time: "16:30", format: "MD3", teamA: "D2", teamB: "C3" },
        { title: "OITAVAS 3", date: "15/08", time: "19:00", format: "MD3", teamA: "A2", teamB: "B3" },
        { title: "OITAVAS 4", date: "15/08", time: "21:30", format: "MD3", teamA: "B2", teamB: "A3" }
      ],
      [
        { title: "QUARTAS 1", date: "22/08", time: "14:00", format: "MD3", teamA: "A1", teamB: "VENCEDOR OITAVAS 1" },
        { title: "QUARTAS 2", date: "22/08", time: "16:30", format: "MD3", teamA: "B1", teamB: "VENCEDOR OITAVAS 2" },
        { title: "QUARTAS 3", date: "22/08", time: "19:00", format: "MD3", teamA: "C1", teamB: "VENCEDOR OITAVAS 3" },
        { title: "QUARTAS 4", date: "22/08", time: "21:30", format: "MD3", teamA: "D1", teamB: "VENCEDOR OITAVAS 4" }
      ],
      [
        { title: "SEMIS 1", date: "29/08", time: "15:00", format: "MD5", teamA: "VENCEDOR QUARTAS 1", teamB: "VENCEDOR QUARTAS 2" },
        { title: "SEMIS 2", date: "29/08", time: "19:00", format: "MD5", teamA: "VENCEDOR QUARTAS 3", teamB: "VENCEDOR QUARTAS 4" }
      ],
      [
        { title: "GRANDE FINAL", date: "05/09", time: "17:30", format: "MD5", teamA: "VENCEDOR SEMI 1", teamB: "VENCEDOR SEMI 2" }
      ]
    ],
    teams: createPlaceholderTeams(16, 3),
    vod: {
      title: "TIME A X TIME B - R1 GRUPO A",
      url: "",
      thumbnail: ""
    },
    vods: [
      {
        title: "",
        url: "",
        thumbnail: ""
      }
    ],
    statistics: createPlaceholderStatistics()
  }
};
