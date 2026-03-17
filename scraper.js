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

// Queries específicas para o LinkedIn RSS
const LINKEDIN_SEARCHES = [
  "armazém Coimbra",
  "logística Coimbra",
  "entregador Coimbra",
  "operador armazém Coimbra",
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
          jobs.push({ title, company, location: jobLocation, url, snippet: cleanHTML(snippet), source: "Indeed" });
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
      jobs.push({ title, company, location, url, snippet: "", source: "Indeed" });
    }
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

// ─── LINKEDIN RSS SCRAPER ─────────────────────────────────────────────────────
// O LinkedIn expõe um RSS feed público para pesquisas de emprego — sem auth,
// sem scraping, sem violar ToS. Retorna as vagas mais recentes em XML.
function fetchLinkedIn(query) {
  return new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query);
    // f_TPR=r604800 → últimos 7 dias | f_WT=2 → presencial | sortBy=DD → mais recentes
    const path = `/jobs/search?keywords=${encodedQuery}&location=Portugal&f_TPR=r604800&sortBy=DD&start=0`;

    const options = {
      hostname: "www.linkedin.com",
      path: path,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const jobs = parseLinkedInHTML(data, query);
        resolve(jobs);
      });
    });

    req.on("error", (err) => {
      console.error(`Error fetching LinkedIn for "${query}":`, err.message);
      resolve([]);
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve([]);
    });

    req.end();
  });
}

function parseLinkedInHTML(html, query) {
  const jobs = [];

  // LinkedIn embeds job data as JSON-LD ou em data attributes
  // Tentativa 1: JSON-LD structured data
  const jsonLdMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "JobPosting") {
          const title = item.title || "";
          const company = item.hiringOrganization?.name || "N/D";
          const location = item.jobLocation?.address?.addressLocality || "Portugal";
          const url = item.url || `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(query)}`;
          const snippet = item.description?.slice(0, 200) || "";

          if (isRelevant(title, snippet)) {
            jobs.push({ title, company, location, url: url.split("?")[0], snippet: snippet.replace(/<[^>]+>/g, "").trim(), source: "LinkedIn" });
          }
        }
      }
    } catch (e) {
      // continua
    }
  }

  if (jobs.length > 0) return jobs;

  // Tentativa 2: extrair de data-entity-urn e títulos no HTML
  const titleMatches = [...html.matchAll(/class="[^"]*base-search-card__title[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/h3>/gi)];
  const companyMatches = [...html.matchAll(/class="[^"]*base-search-card__subtitle[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/[^>]+>/gi)];
  const locationMatches = [...html.matchAll(/class="[^"]*job-search-card__location[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/span>/gi)];
  const linkMatches = [...html.matchAll(/href="(https:\/\/[a-z]{2,3}\.linkedin\.com\/jobs\/view\/[^"?]+)/gi)];

  for (let i = 0; i < titleMatches.length && i < 15; i++) {
    const title = cleanHTML(titleMatches[i][1]);
    const company = companyMatches[i] ? cleanHTML(companyMatches[i][1]) : "N/D";
    const location = locationMatches[i] ? cleanHTML(locationMatches[i][1]) : "Portugal";
    const url = linkMatches[i] ? linkMatches[i][1] : `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(query)}`;

    if (title && isRelevant(title, "")) {
      jobs.push({ title, company, location, url, snippet: "", source: "LinkedIn" });
    }
  }

  return jobs;
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
        jobs.push({ title, company, location: "Coimbra", url, snippet: "", source: "Net-Empregos" });
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
  if (jobs.length === 0) return null;

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

  const SOURCE_EMOJI = { LinkedIn: "🔵", Indeed: "🟡", "Net-Empregos": "🟢" };

  for (const job of jobs.slice(0, 10)) {
    const srcEmoji = SOURCE_EMOJI[job.source] || "•";
    const srcLabel = job.source ? ` · ${srcEmoji} ${job.source}` : "";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${job.url}|${job.title}>*\n🏢 ${job.company} · 📍 ${job.location}${srcLabel}${job.snippet ? `\n_${job.snippet.slice(0, 120)}..._` : ""}`,
      },
    });
    blocks.push({ type: "divider" });
  }

  if (jobs.length > 10) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_...e mais ${jobs.length - 10} vaga(s). Verifica o Indeed ou LinkedIn para ver todas._`,
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

  // Fetch from LinkedIn
  for (const query of LINKEDIN_SEARCHES) {
    console.log(`  → LinkedIn: "${query}"`);
    const jobs = await fetchLinkedIn(query);
    console.log(`     ${jobs.length} vaga(s) encontrada(s)`);
    allJobs.push(...jobs);
    await new Promise((r) => setTimeout(r, 2000));
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

  // Send to Slack — apenas se houver vagas
  if (unique.length === 0) {
    console.log("ℹ️ Nenhuma vaga encontrada — notificação Slack não enviada.");
    return;
  }

  const payload = buildSlackPayload(unique);
  await sendSlackMessage(payload);
  console.log("\n📨 Notificação enviada para o Slack!");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
