import { __test } from "../worker/fantasy-admin.js";

const roundNumber = Math.trunc(Number(process.argv[2] || 2));
if (!Number.isInteger(roundNumber) || roundNumber < 1) {
  throw new TypeError("Informe uma rodada válida.");
}

const sourceUrl = new URL(
  "assets/fantasy-source.json",
  "https://liga-rk.github.io/liga-rk-26-2/"
);
sourceUrl.searchParams.set("preview", Date.now());
const contentUrl = new URL("https://liga-rk-api.suporteinhouserk.workers.dev/api/content");
contentUrl.searchParams.set("preview", Date.now());

const [sourceResponse, contentResponse] = await Promise.all([
  fetch(sourceUrl, { headers: { Accept: "application/json" } }),
  fetch(contentUrl, { headers: { Accept: "application/json" } })
]);
if (!sourceResponse.ok) throw new Error(`Fonte do Fantasy respondeu HTTP ${sourceResponse.status}.`);
if (!contentResponse.ok) throw new Error(`Conteúdo oficial respondeu HTTP ${contentResponse.status}.`);

const source = await sourceResponse.json();
const contentPayload = await contentResponse.json();
const merged = __test.mergeLiveOfficialContent(
  source,
  contentPayload.content,
  contentPayload.updatedAt
);
const divisions = {};
for (const division of ["elite", "ascension"]) {
  const round = await __test.normalizeFormulaV2Round(merged, roundNumber, division);
  divisions[division] = {
    ready: round.ready,
    expectedSeries: round.expectedSeries,
    completedSeries: round.completedSeries,
    playedSeries: round.playedSeries,
    walkovers: round.walkovers,
    postponed: round.postponed,
    cancelled: round.cancelled,
    maps: round.series.reduce((sum, item) => sum + item.mapas.length, 0),
    ignoredStatSeries: round.ignoredStatSeries,
    missingPlayableSeries: round.missingPlayableSeries,
    unknownSeries: round.unknownSeries
  };
}

console.log(JSON.stringify({
  roundNumber,
  sourceGeneratedAt: source.generatedAt,
  contentUpdatedAt: contentPayload.updatedAt,
  divisions
}, null, 2));
