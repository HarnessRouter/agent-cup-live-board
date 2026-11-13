(function () {
  const params = new URLSearchParams(location.search);
  const path = location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  const venue = params.get("venue") || (last === "stanford" || last === "berkeley" ? last : "");
  const preview = params.has("preview");
  const screen = params.has("screen");

  function siteRoot() {
    const p = location.pathname.replace(/\/index\.html$/, "");
    const m = p.match(/^(.*?)\/(?:stanford|berkeley)\/?$/);
    if (m) {
      const prefix = m[1] || "";
      return (prefix.endsWith("/") ? prefix : prefix + "/") || "/";
    }
    const dir = p.replace(/\/[^/]*$/, "/");
    return dir || "/";
  }
  const ROOT = siteRoot();
  const boardJsonUrl = ROOT + "board.json";
  const venueUrl = (v, qs) => ROOT + v + "/" + (qs ? "?" + qs : "");

  const $ = (id) => document.getElementById(id);
  if (screen) document.body.classList.add("screen");

  let visible = [];
  let idx = 0;
  let timer = null;
  let qrBuilt = false;

  function venueInfo(data) {
    return (data.venues && data.venues[venue]) || {};
  }

  function livePhoneUrl() {
    return location.origin + venueUrl(venue, "");
  }

  function renderQR() {
    const box = $("qr");
    if (!box || typeof QRCode === "undefined") return;
    box.innerHTML = "";
    new QRCode(box, {
      text: livePhoneUrl(),
      width: 196,
      height: 196,
      colorDark: "#0d0c0b",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
    qrBuilt = true;
  }

  function skills(s) {
    return (s || "")
      .split(/,|·/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function prettyVenue(v) {
    return v === "stanford" ? "Stanford" : v === "berkeley" ? "Berkeley" : v;
  }

  function cardHTML(c) {
    const pills = skills(c.skills)
      .map((s) => `<span class="skill">${escapeHtml(s)}</span>`)
      .join("");
    const seatWord = c.seats_left === 1 ? "seat left" : "seats left";
    return `<article class="card" data-id="${escapeHtml(c.id)}">
      <div class="kicker"><span>${escapeHtml(c.id)} · ${escapeHtml(c.status)}</span><span>${escapeHtml((c.venues || []).map(prettyVenue).join(" · "))}</span></div>
      <h2>${escapeHtml(c.title)}</h2>
      <p class="one-liner">${escapeHtml(c.one_line)}</p>
      <div class="skills">${pills}</div>
      <div class="card-foot">
        <div class="owner"><span>Owner</span>${escapeHtml(c.owner_first_name)}</div>
        <div class="seats"><b>${c.seats_left}</b><em>${seatWord}</em></div>
      </div>
    </article>`;
  }

  function visiblePreviewCount(data) {
    const n = (data.cards || []).filter((c) => (c.venues || []).includes(venue)).length;
    return n ? String(n) : "No";
  }

  function emptyHTML(data) {
    if (preview) {
      return `<div class="empty"><div class="eyebrow">Preview</div><h2>No open cards yet</h2><p>When the sheet has Owner seeking or Forming cards with seats left, they will show up here.</p></div>`;
    }
    return `<div class="empty">
      <div class="eyebrow">Live · waiting on check-in</div>
      <h2>Cards appear when owners check in at the door</h2>
      <p>Scan the new Luma QR at check-in. If the owner is looking for teammates, their card shows up here within about a minute. ${visiblePreviewCount(data)} cards are ready in preview.</p>
    </div>`;
  }

  function dots(n, on) {
    if (n < 2) return "";
    let h = '<div class="dots">';
    for (let i = 0; i < n; i++) h += `<i class="${i === on ? "on" : ""}"></i>`;
    return h + "</div>";
  }

  function render(data) {
    const v = venueInfo(data);
    const name = data.public_name || "The Agent Cup";
    $("title").textContent = name + " · " + (v.label || prettyVenue(venue) || "Board");
    document.title = $("title").textContent + " · Problem Board";
    const bits = [v.venue, v.when, v.address].filter(Boolean);
    const updated = data.generated_at_label ? "Updated " + data.generated_at_label : "";
    $("meta").textContent = bits.concat(updated).join(" · ");
    const mode = $("mode");
    mode.textContent = preview ? "Preview" : "Live";
    mode.className = "badge " + (preview ? "preview" : "live");

    const pool = (data.cards || []).filter((c) => (c.venues || []).includes(venue));
    visible = preview ? pool : pool.filter((c) => c.checked_in);
    $("count").textContent = visible.length + (visible.length === 1 ? " card" : " cards");

    const col = $("cards");
    if (!visible.length) {
      col.innerHTML = emptyHTML(data);
    } else if (screen) {
      if (idx >= visible.length) idx = 0;
      col.innerHTML = cardHTML(visible[idx]) + dots(visible.length, idx);
    } else {
      col.innerHTML = visible.map(cardHTML).join("");
    }

    const dock = $("dock");
    const links = [];
    if (v.discord) links.push(`<a href="${v.discord}">Campus Discord</a>`);
    if (data.community) links.push(`<a href="${data.community}">Community</a>`);
    if (venue) {
      if (!preview) links.push(`<a href="${venueUrl(venue, "preview=1")}">Preview</a>`);
      else links.push(`<a href="${venueUrl(venue, "")}">Live</a>`);
      links.push(`<a href="${venueUrl(venue, (preview ? "preview=1&" : "") + "screen=1")}">Big screen</a>`);
    }
    links.push(`<a href="${ROOT}">All venues</a>`);
    dock.innerHTML = links.join("");

    if (screen && !qrBuilt) renderQR();
  }

  function startRotate() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!screen || visible.length < 2) return;
      idx = (idx + 1) % visible.length;
      $("cards").innerHTML = cardHTML(visible[idx]) + dots(visible.length, idx);
    }, 12000);
  }

  async function load() {
    try {
      const res = await fetch(boardJsonUrl + "?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("bad status " + res.status);
      const data = await res.json();
      render(data);
      if (screen) startRotate();
    } catch (err) {
      $("meta").textContent = "Could not load the board. Retrying…";
    }
  }

  if (!venue) {
    $("meta").textContent = "Pick a venue from the home page.";
    $("cards").innerHTML = `<div class="empty"><h2>Choose a venue</h2><p><a href="${ROOT}">Go to the live board home</a></p></div>`;
    return;
  }

  load();
  setInterval(load, 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) load();
  });
})();
