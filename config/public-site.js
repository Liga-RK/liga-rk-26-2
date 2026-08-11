const ORIGIN = "https://liga-rk.github.io";
const BASE_PATH = "/liga-rk-26-2";
const SITE_NAME = "Liga RK 26.2";

const SOCIAL_PROFILES = [
  "https://discord.gg/m9C7dbQUSV",
  "https://chat.whatsapp.com/JvqkNB8e9KyK8I8adHoKZq",
  "https://kick.com/rk-inhouse",
  "https://www.youtube.com/@rk-inhouse",
  "https://www.instagram.com/inhouserk/",
  "https://www.tiktok.com/@inhouse_rk"
];

function siteUrl(relativePath = "") {
  const normalizedPath = String(relativePath).replace(/^\/+/, "");
  const baseUrl = `${ORIGIN}${BASE_PATH}/`;
  return normalizedPath ? new URL(normalizedPath, baseUrl).href : baseUrl;
}

const PAGE_METADATA = {
  "index.html": {
    path: "",
    title: "Liga RK 26.2 | Comunidade RK — League of Legends",
    description:
      "Site oficial da Liga RK, circuito competitivo da Comunidade RK, fundada por Raí Bezerra (RK) e atualmente liderada pelo CEO Henrique Marques (Rick).",
    image: "assets/logo_liga_rk_seo_512.png",
    imageWidth: 512,
    imageHeight: 512,
    structuredData: true,
    sitemap: true
  },
  "sobre/index.html": {
    path: "sobre/",
    title: "Sobre a RK | Liga RK",
    description:
      "Conheça a Comunidade RK, fundada por Raí Bezerra (RK), e sua liderança atual: Henrique Marques (Rick), CEO da comunidade.",
    image: "assets/logo_liga_rk_seo_512.png",
    imageWidth: 512,
    imageHeight: 512,
    structuredData: true,
    sitemap: true
  },
  "elite.html": {
    path: "elite.html",
    title: "Divisão Elite | Liga RK 26.2",
    description:
      "Acompanhe equipes, calendário, resultados, estatísticas e transmissões da Divisão Elite da Liga RK 26.2.",
    image: "assets/fundo_elite.jpg",
    imageWidth: 1920,
    imageHeight: 1080,
    sitemap: true
  },
  "ascensao.html": {
    path: "ascensao.html",
    title: "Divisão Ascensão | Liga RK 26.2",
    description:
      "Acompanhe equipes, calendário, resultados, estatísticas e transmissões da Divisão Ascensão da Liga RK 26.2.",
    image: "assets/fundo_ascensao.jpg",
    imageWidth: 1920,
    imageHeight: 1080,
    sitemap: true
  },
  "estatisticas.html": {
    path: "estatisticas.html",
    title: "Estatísticas | Liga RK 26.2",
    description:
      "Estatísticas oficiais de jogadores, equipes e partidas das divisões Elite e Ascensão da Liga RK 26.2.",
    image: "assets/logo_liga_rk_seo_512.png",
    imageWidth: 512,
    imageHeight: 512,
    sitemap: true
  },
  "bolao.html": {
    path: "bolao.html",
    title: "Bolão Liga RK | Liga RK 26.2",
    description: "Bolão oficial da Liga RK 26.2 para a comunidade acompanhar e registrar seus palpites.",
    image: "assets/logo_liga_rk_seo_512.png",
    imageWidth: 512,
    imageHeight: 512,
    sitemap: true
  },
  "fantasy/index.html": {
    path: "fantasy/",
    title: "Fantasy RK | Liga RK 26.2",
    description: "Fantasy RK — o fantasy oficial da Liga RK 26.2.",
    image: "fantasy/assets/branding/og-rk-fantasy.png",
    imageWidth: 1731,
    imageHeight: 909,
    sitemap: true
  }
};

function organizationGraph(pagePath = "") {
  const homeUrl = siteUrl();
  const pageUrl = siteUrl(pagePath);
  const organizationId = `${homeUrl}#organization`;
  const founderId = `${homeUrl}#founder-rk`;
  const leaderId = `${homeUrl}#henrique-marques`;
  const ligaId = `${homeUrl}#liga-rk`;
  const inhouseId = `${homeUrl}#rk-inhouse`;
  const websiteId = `${homeUrl}#website`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: "Comunidade RK",
        alternateName: "RK",
        url: homeUrl,
        logo: siteUrl("assets/logo_liga_rk_seo_512.png"),
        description:
          "Comunidade brasileira de League of Legends voltada a jogadores, Inhouses, campeonatos e experiências competitivas de esports.",
        founder: { "@id": founderId },
        subOrganization: [{ "@id": inhouseId }, { "@id": ligaId }],
        sameAs: SOCIAL_PROFILES
      },
      {
        "@type": "Person",
        "@id": founderId,
        name: "Raí Bezerra",
        alternateName: "RK",
        description: "Fundador original da Comunidade RK."
      },
      {
        "@type": "Person",
        "@id": leaderId,
        name: "Henrique Marques",
        alternateName: "Rick",
        jobTitle: "CEO e líder da Comunidade RK",
        worksFor: { "@id": organizationId },
        description:
          "Atual CEO e líder da Comunidade RK, atuando na organização da comunidade e no desenvolvimento da Liga RK e de seus projetos competitivos."
      },
      {
        "@type": "Organization",
        "@id": inhouseId,
        name: "RK Inhouse",
        parentOrganization: { "@id": organizationId },
        description:
          "Projeto da Comunidade RK voltado a Inhouses e experiências competitivas para jogadores de League of Legends."
      },
      {
        "@type": "SportsOrganization",
        "@id": ligaId,
        name: "Liga RK",
        url: homeUrl,
        parentOrganization: { "@id": organizationId },
        description:
          "Circuito competitivo da Comunidade RK que organiza campeonatos de League of Legends para equipes e jogadores."
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: homeUrl,
        name: SITE_NAME,
        inLanguage: "pt-BR",
        publisher: { "@id": organizationId }
      },
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: PAGE_METADATA[pagePath ? "sobre/index.html" : "index.html"].title,
        isPartOf: { "@id": websiteId },
        about: [{ "@id": organizationId }, { "@id": ligaId }, { "@id": leaderId }],
        inLanguage: "pt-BR"
      }
    ]
  };
}

module.exports = {
  BASE_PATH,
  ORIGIN,
  PAGE_METADATA,
  SITE_NAME,
  SOCIAL_PROFILES,
  organizationGraph,
  siteUrl
};
