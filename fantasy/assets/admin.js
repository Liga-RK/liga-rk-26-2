(() => {
  "use strict";
  const api = String(window.FANTASY_RK_CONFIG?.apiBase || "").replace(/\/$/, "");
  const authToken = String(localStorage.getItem("rk-fantasy-session-v1") || "").trim();
  const $ = (selector) => document.querySelector(selector);
  let currentRoundId = ""; let previewToken = "";
  document.addEventListener("click", async (event) => { const button=event.target.closest("[data-action]"); if(!button)return; button.disabled=true; try{await actions[button.dataset.action]?.();}catch(error){message(error.message,true);}finally{button.disabled=false;} });
  boot();
  async function boot(){const me=await request("/api/fantasy/me");if(!me.data?.isAdmin)throw new Error("Acesso restrito aos administradores autorizados.");$("#admin-user").textContent=me.data.user.username;}
  const actions={
    "save-round": async()=>{const body={division:$("#division").value,roundNumber:Number($("#round-number").value),name:$("#round-name").value,opensAt:new Date($("#opens-at").value).toISOString(),locksAt:new Date($("#locks-at").value).toISOString()};const out=await request("/api/fantasy/admin/rounds",{method:"POST",body});currentRoundId=out.data.roundId;message("Rodada salva.");},
    "sync-content":()=>post("/api/fantasy/admin/content/sync"), "snapshot":()=>post("/api/fantasy/admin/market/snapshot"), "open":()=>status("open"), "lock":()=>status("locked"),
    "load-matches":async()=>{const out=await request(`/api/fantasy/admin/matches?division=${$("#division").value}`);$("#match-list").innerHTML=(out.data.matches||[]).map(match=>`<label class="match-row"><input type="checkbox" value="${escapeHtml(match.matchId)}" ${match.roundId?"disabled":""}><span><strong>${escapeHtml(match.blueName)} × ${escapeHtml(match.redName)}</strong><small>${escapeHtml(match.matchId)} · ${match.roundId?"já associado":"disponível"}</small></span></label>`).join("")||'<p class="empty-state">Nenhum mapa publicado.</p>';},
    "associate":async()=>{const matchIds=[...document.querySelectorAll("#match-list input:checked")].map(x=>x.value);await post("/api/fantasy/admin/rounds/matches",{roundId:currentRoundId,matchIds});},
    "preview":async()=>{const out=await post("/api/fantasy/admin/scoring/preview",{roundId:currentRoundId});previewToken=out.data.previewToken;$("#preview").textContent=JSON.stringify(out.data,null,2);document.querySelector('[data-action="confirm"]').disabled=false;},
    "confirm":async()=>{if(!confirm("Confirma a pontuação e a valorização exibidas na prévia?"))return;await post("/api/fantasy/admin/scoring/confirm",{roundId:currentRoundId,previewToken});},
    "reprocess":async()=>{const text=prompt('Para reprocessar, digite REPROCESSAR. Rodadas posteriores podem impedir a ação.');if(text!=="REPROCESSAR")return;await post("/api/fantasy/admin/scoring/reprocess",{roundId:currentRoundId,confirmation:text});},
    "export":()=>location.assign(`${api}/api/fantasy/admin/ranking.csv?division=${$("#division").value}`)
  };
  async function status(value){await post("/api/fantasy/admin/rounds/status",{roundId:currentRoundId,status:value});}
  async function post(path,body={roundId:currentRoundId,division:$("#division").value}){await request(path,{method:"POST",body});message("Operação concluída.");}
  async function request(path,options={}){const headers={Accept:"application/json"};if(authToken)headers.Authorization=`Bearer ${authToken}`;if(options.body){headers["Content-Type"]="application/json";}const response=await fetch(api+path,{method:options.method||"GET",credentials:"include",headers,body:options.body?JSON.stringify(options.body):undefined,cache:"no-store"});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error?.message||"Falha na operação.");return payload;}
  function message(text,error=false){$("#admin-message").textContent=text;$("#admin-message").className=`status-message ${error?"error":"success"}`;}
  function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
})();
