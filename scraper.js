const https = require("https");
const http = require("http");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const SEARCHES = [
  { query: "armazém logística", location: "Coimbra" },
  { query: "entregador estafeta", location: "Coimbra" },
  { query: "operador armazém", location: "Coimbra" },
  { query: "transportadora distribuição", location: "Coimbra" },
];

const KEYWORDS_GOOD = [
  "armazém", "logística", "entregador", "estafeta", "carteiro",
  "distribuição", "transportadora", "part-time", "part time",
  "meio período", "ctt", "dpd", "dhl", "gls", "fedex", "ups",
  "leroy merlin", "operador",
];

const KEYWORDS_BAD = [
  "engenheiro", "desenvolvedor", "programador", "contabilista",
  "enfermeiro", "médico", "professor", "vendedor", "comercial",
];

// ─── INDEED SCRAPER ───────────────────────────────────────────────────────────
function fetchIndeed(query, location) {
  return new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query);
    const encodedLocation = encodeURIComponent(location);
    const url = `https://pt.indeed.com/jobs?q=${encodedQuery}&l=${encodedLocation}&fromage=7&sort=date`;

    const options = {
      hostname: "pt.indeed.com",
      path: `/jobs?q=${encodedQuery}&l=${encodedLocation}&fromage=7&sort=date`,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate",
        Connection: "keep-alive",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const jobs = parseIndeedHTML(data, query, location);
        resolve(jobs);
      });
    });

    req.on("error", (err) => {
      console.error(`Error fetching Indeed for "${query}":`, err.message);
      resolve([]);
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve([]);
    });

    req.end();
  });
}

function parseIndeedHTML(html, query, location) {
  const jobs = [];

  // Extract job cards from Indeed HTML
  const jobCardRegex =
    /<div[^>]*class="[^"]*job_seen_beacon[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  const titleRegex = /<span[^>]*title="([^"]+)"[^>]*>/i;
  const companyRegex =
    /<span[^>]*class="[^"]*companyName[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
  const locationRegex =
    /<div[^>]*class="[^"]*companyLocation[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
  const linkRegex = /href="(\/rc\/clk[^"]+|\/pagead\/clk[^"]+)"/i;
  const jkRegex = /data-jk="([^"]+)"/i;

  // Alternative: extract from JSON data embedded in page
  const jsonMatch = html.match(/window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*(\{[\s\S]+?\});/);
  
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const jobsList = data?.metaData?.mosaicProviderJobCardsModel?.results || [];
      
      for (const job of jobsList.slice(0, 15)) {
        const title = job.title || "";
        const company = job.company || "";
        const jobLocation = job.formattedLocation || location;
        const jobKey = job.jobkey || "";
        const url = jobKey ? `https://pt.indeed.com/viewjob?jk=${jobKey}` : `https://pt.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}`;
        const snippet = job.snippet || "";

        if (isRelevant(title, snippet)) {
          jobs.push({ title, company, location: jobLocation, url, snippet: cleanHTML(snippet) });
        }
      }
      return jobs;
    } catch (e) {
      // Fall through to regex parsing
    }
  }

  // Fallback: try to extract job titles via regex
  const titleMatches = html.matchAll(/<h2[^>]*class="[^"]*jobTitle[^"]*"[^>]*>[\s\S]*?<span[^>]*title="([^"]+)"/gi);
  const companyMatches = [...html.matchAll(/<span[^>]*data-testid="company-name"[^>]*>([\s\S]*?)<\/span>/gi)];
  const jkMatches = [...html.matchAll(/data-jk="([a-z0-9]+)"/gi)];

  let idx = 0;
  for (const match of titleMatches) {
    const title = match[1];
    const company = companyMatches[idx] ? cleanHTML(companyMatches[idx][1]) : "N/D";
    const jobKey = jkMatches[idx] ? jkMatches[idx][1] : "";
    const url = jobKey ? `https://pt.indeed.com/viewjob?jk=${jobKey}` : `https://pt.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}`;

    if (isRelevant(title, "")) {
      jobs.push({ title, company, location, url, snippet: "" });
    }
    idx++;
    if (idx >= 15) break;
  }

  return jobs;
}

function cleanHTML(str) {
  return str.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
}

function isRelevant(title, snippet) {
  const text = (title + " " + snippet).toLowerCase();

  // Filter out bad keywords
  for (const bad of KEYWORDS_BAD) {
    if (text.includes(bad)) return false;
  }

  // Must include at least one good keyword
  for (const good of KEYWORDS_GOOD) {
    if (text.includes(good)) return true;
  }

  return false;
}

// ─── NET-EMPREGOS SCRAPER ─────────────────────────────────────────────────────
function fetchNetEmpregos(query) {
  return new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query + " Coimbra");
    const options = {
      hostname: "www.net-empregos.com",
      path: `/pesquisa-empregos.asp?q=${encodedQuery}&dias=7`,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept-Language": "pt-PT,pt;q=0.9",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const jobs = parseNetEmpregosHTML(data);
        resolve(jobs);
      });
    });

    req.on("error", () => resolve([]));
    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function parseNetEmpregosHTML(html) {
  const jobs = [];
  const jobRegex = /<div[^>]*class="[^"]*job-item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  const titleRegex = /<a[^>]*class="[^"]*job-title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
  const companyRegex = /<span[^>]*class="[^"]*company[^"]*"[^>]*>([\s\S]*?)<\/span>/i;

  let match;
  while ((match = jobRegex.exec(html)) !== null) {
    const block = match[1];
    const titleMatch = block.match(titleRegex);
    const companyMatch = block.match(companyRegex);

    if (titleMatch) {
      const title = cleanHTML(titleMatch[2]);
      const company = companyMatch ? cleanHTML(companyMatch[1]) : "N/D";
      const url = titleMatch[1].startsWith("http")
        ? titleMatch[1]
        : `https://www.net-empregos.com${titleMatch[1]}`;

      if (isRelevant(title, "")) {
        jobs.push({ title, company, location: "Coimbra", url, snippet: "" });
      }
    }
  }

  return jobs;
}

// ─── DEDUPLICATION ────────────────────────────────────────────────────────────
function deduplicateJobs(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── SLACK NOTIFICATION ───────────────────────────────────────────────────────
function sendSlackMessage(payload) {
  return new Promise((resolve, reject) => {
    if (!SLACK_WEBHOOK_URL) {
      console.log("No SLACK_WEBHOOK_URL set, printing to console instead:");
      console.log(JSON.stringify(payload, null, 2));
      resolve();
      return;
    }

    const body = JSON.stringify(payload);
    const url = new URL(SLACK_WEBHOOK_URL);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      res.on("data", () => {});
      res.on("end", resolve);
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function buildSlackPayload(jobs) {
  if (jobs.length === 0) {
    return {
      text: "📦 *Job Scanner — Coimbra*",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "📦 *Job Scanner — Coimbra*\n\nNenhuma vaga nova encontrada hoje. Continua à espera! 🤞",
          },
        },
      ],
    };
  }

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📦 Job Scanner — ${jobs.length} vaga(s) nova(s) em Coimbra!`,
      },
    },
    { type: "divider" },
  ];

  for (const job of jobs.slice(0, 10)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${job.url}|${job.title}>*\n🏢 ${job.company} · 📍 ${job.location}${job.snippet ? `\n_${job.snippet.slice(0, 120)}..._` : ""}`,
      },
    });
    blocks.push({ type: "divider" });
  }

  if (jobs.length > 10) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_...e mais ${jobs.length - 10} vaga(s). Verifica o Indeed para ver todas._`,
      },
    });
  }

  return { text: `📦 ${jobs.length} vaga(s) nova(s) em Coimbra!`, blocks };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔍 A procurar vagas em Coimbra...\n");

  const allJobs = [];

  // Fetch from Indeed for each search query
  for (const search of SEARCHES) {
    console.log(`  → Indeed: "${search.query}" em ${search.location}`);
    const jobs = await fetchIndeed(search.query, search.location);
    console.log(`     ${jobs.length} vaga(s) encontrada(s)`);
    allJobs.push(...jobs);

    // Small delay to be polite
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Fetch from Net-Empregos
  console.log(`  → Net-Empregos: logística Coimbra`);
  const netJobs = await fetchNetEmpregos("logística armazém entregador");
  console.log(`     ${netJobs.length} vaga(s) encontrada(s)`);
  allJobs.push(...netJobs);

  // Deduplicate
  const unique = deduplicateJobs(allJobs);
  console.log(`\n✅ Total único: ${unique.length} vaga(s)\n`);

  if (unique.length > 0) {
    console.log("Vagas encontradas:");
    unique.forEach((j) => console.log(`  - ${j.title} @ ${j.company} (${j.location})`));
  }

  // Send to Slack
  const payload = buildSlackPayload(unique);
  await sendSlackMessage(payload);
  console.log("\n📨 Notificação enviada para o Slack!");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
