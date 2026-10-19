/* Request lifecycle is isolated from UI and data-rendering code. */
export function createApi(requests) {
  return async function fetchJson(url, timeout=14000) {
    const previous=state.requests.get(url); if(previous) previous.abort();
    const controller=new AbortController(); state.requests.set(url,controller);
    const timer=setTimeout(()=>controller.abort(),timeout);
    try { const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}}); if(!response.ok) throw new Error('HTTP '+response.status); return await response.json(); }
    finally { clearTimeout(timer); if(state.requests.get(url)===controller)state.requests.delete(url); }
  };
}
