// Mock server for end-to-end tests of the edge functions.
//
//   /ghl/*            in-memory GoHighLevel API (the parts the functions use)
//   /auth/v1/user     minimal Supabase Auth: user JWTs (role=authenticated) are accepted
//   /rest/v1/*        proxied to a local PostgREST
//   /functions/v1/*   proxied to the locally running edge functions
//   /__state          inspect the mock GHL state + request log
//   /__reset          clear state   /__seed  merge JSON into state
//
// Start: deno run -A mock_server.ts   (env: MOCK_PORT, POSTGREST_URL, FUNCTION_PORTS='{"ghl-sync":9101,...}')

type Rec = Record<string, any>;

const PORT = Number(Deno.env.get('MOCK_PORT') || 9000);
const POSTGREST = Deno.env.get('POSTGREST_URL') || 'http://127.0.0.1:3000';
const FUNCTION_PORTS: Record<string, number> = JSON.parse(Deno.env.get('FUNCTION_PORTS') || '{}');

let seq = 0;
// GHL ids are 20 characters; code parses them out of error messages, so keep the same shape
const nid = (p: string) => `${p}${(++seq).toString(36).padStart(18, '0')}`;
const now = () => new Date().toISOString();

function fresh() {
  return {
    contacts: {} as Record<string, Rec>,
    tasks: {} as Record<string, Rec>,          // id -> task (with contactId)
    notes: {} as Record<string, Rec>,
    opportunities: {} as Record<string, Rec>,
    pipelines: [] as Rec[],
    calendars: [] as Rec[],
    appointments: {} as Record<string, Rec>,
    businesses: {} as Record<string, Rec>,
    locationTags: [] as Rec[],
    customFields: [] as Rec[],
    conversations: [] as Rec[],
    messages: [] as Rec[],
    documents: [] as Rec[],
    log: [] as { method: string; path: string; body?: any }[],
  };
}
let S = fresh();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function b64urlDecode(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

async function handleGhl(req: Request, path: string, url: URL): Promise<Response> {
  const m = req.method;
  let body: any = undefined;
  if (m !== 'GET' && m !== 'HEAD') {
    const txt = await req.text();
    try { body = txt ? JSON.parse(txt) : undefined; } catch { body = txt; }
  }
  S.log.push({ method: m, path: path + (url.search || ''), body });
  const seg = path.split('/').filter(Boolean);

  // ---------------------------------------------------------------- contacts
  if (seg[0] === 'contacts') {
    if (seg.length === 1 && m === 'GET') {
      const q = (url.searchParams.get('query') || '').toLowerCase();
      let list = Object.values(S.contacts);
      if (q) list = list.filter((c) => `${c.firstName} ${c.lastName} ${c.email || ''}`.toLowerCase().includes(q));
      return json({ contacts: list, meta: { nextPageUrl: null, total: list.length } });
    }
    if (seg.length === 1 && m === 'POST') {
      const dup = body?.email ? Object.values(S.contacts).find((c) => c.email && c.email === body.email) : null;
      if (dup) return json({ message: 'This location does not allow duplicated contacts.', meta: { contactId: dup.id } }, 400);
      const id = nid('ct');
      S.contacts[id] = { id, tags: [], customFields: [], ...body, dateAdded: now(), dateUpdated: now() };
      return json({ contact: S.contacts[id] }, 201);
    }
    if (seg[1] === 'upsert' && m === 'POST') {
      const dup = Object.values(S.contacts).find((c) => (body?.email && c.email === body.email) || (body?.phone && c.phone === body.phone));
      if (dup) { Object.assign(dup, body, { dateUpdated: now() }); return json({ contact: dup, new: false }); }
      const id = nid('ct');
      S.contacts[id] = { id, tags: [], customFields: [], ...body, dateAdded: now(), dateUpdated: now() };
      return json({ contact: S.contacts[id], new: true });
    }
    const c = S.contacts[seg[1]];
    if (!c) return json({ message: 'Contact not found' }, 400);
    if (seg.length === 2) {
      if (m === 'GET') return json({ contact: c });
      if (m === 'DELETE') { delete S.contacts[seg[1]]; return json({ succeded: true }); }
      if (m === 'PUT') {
        if ('locationId' in (body || {})) return json({ message: ['property locationId should not exist'] }, 422);
        const { customFields, ...rest } = body || {};
        Object.assign(c, rest, { dateUpdated: now() });
        if (Array.isArray(customFields)) {
          for (const f of customFields) {
            const ex = c.customFields.find((x: Rec) => x.id === f.id);
            if (ex) ex.value = f.value; else c.customFields.push({ id: f.id, value: f.value });
          }
        }
        return json({ contact: c });
      }
    }
    if (seg[2] === 'tags') {
      const tags: string[] = body?.tags || [];
      if (m === 'POST') c.tags = [...new Set([...(c.tags || []), ...tags])];
      if (m === 'DELETE') c.tags = (c.tags || []).filter((t: string) => !tags.includes(t));
      c.dateUpdated = now();
      return json({ tags: c.tags });
    }
    if (seg[2] === 'tasks') {
      if (seg.length === 3 && m === 'GET') return json({ tasks: Object.values(S.tasks).filter((t) => t.contactId === c.id) });
      if (seg.length === 3 && m === 'POST') {
        if (!body?.dueDate) return json({ message: ['dueDate must be a valid ISO 8601 date string'] }, 422);
        const id = nid('tk');
        S.tasks[id] = { id, contactId: c.id, completed: false, ...body, dateAdded: now() };
        return json({ task: S.tasks[id] }, 201);
      }
      const t = S.tasks[seg[3]];
      if (!t || t.contactId !== c.id) return json({ message: 'Task not found' }, 404);
      if (m === 'GET') return json({ task: t });
      if (m === 'PUT') { Object.assign(t, body); return json({ task: t }); }
      if (m === 'DELETE') { delete S.tasks[seg[3]]; return json({ succeded: true }); }
    }
    if (seg[2] === 'notes') {
      if (m === 'POST') { const id = nid('nt'); S.notes[id] = { id, contactId: c.id, ...body }; return json({ note: S.notes[id] }, 201); }
      if (m === 'PUT') { const n = S.notes[seg[3]]; if (!n) return json({}, 404); Object.assign(n, body); return json({ note: n }); }
      if (m === 'DELETE') { delete S.notes[seg[3]]; return json({ succeded: true }); }
    }
  }

  // ----------------------------------------------------------- opportunities
  if (seg[0] === 'opportunities') {
    if (seg[1] === 'pipelines') return json({ pipelines: S.pipelines });
    if (seg[1] === 'search') {
      const list = Object.values(S.opportunities).map((o) => ({ ...o, contact: S.contacts[o.contactId] ? { id: o.contactId, name: `${S.contacts[o.contactId].firstName} ${S.contacts[o.contactId].lastName || ''}`.trim() } : undefined }));
      return json({ opportunities: list, meta: { total: list.length } });
    }
    if (seg.length === 1 && m === 'POST') {
      if (!body?.pipelineId || !body?.contactId) return json({ message: 'pipelineId and contactId required' }, 422);
      const id = nid('op');
      S.opportunities[id] = { id, ...body, dateAdded: now(), dateUpdated: now() };
      return json({ opportunity: S.opportunities[id] }, 201);
    }
    const o = S.opportunities[seg[1]];
    if (!o) return json({ message: 'Opportunity not found' }, 404);
    if (m === 'GET') return json({ opportunity: o });
    if (m === 'PUT') {
      if ('locationId' in (body || {})) return json({ message: ['property locationId should not exist'] }, 422);
      Object.assign(o, body, { dateUpdated: now() }); return json({ opportunity: o });
    }
    if (m === 'DELETE') { delete S.opportunities[seg[1]]; return json({ succeded: true }); }
  }

  // --------------------------------------------------------------- calendars
  if (seg[0] === 'calendars') {
    if (seg.length === 1) return json({ calendars: S.calendars });
    if (seg[1] === 'events' && seg.length === 2 && m === 'GET') {
      const cal = url.searchParams.get('calendarId');
      return json({ events: Object.values(S.appointments).filter((a) => a.calendarId === cal && !a.deleted) });
    }
    if (seg[1] === 'events' && seg[2] === 'appointments') {
      if (seg.length === 3 && m === 'POST') {
        if (!body?.contactId || !body?.calendarId) return json({ message: 'contactId/calendarId required' }, 422);
        const id = nid('ap');
        S.appointments[id] = { id, ...body, dateAdded: now(), dateUpdated: now() };
        return json({ id, ...S.appointments[id] }, 201);
      }
      const a = S.appointments[seg[3]];
      if (!a || a.deleted) return json({ message: 'Appointment not found' }, 404);
      if (m === 'PUT') { Object.assign(a, body, { dateUpdated: now() }); return json({ id: a.id, ...a }); }
      if (m === 'DELETE') { a.deleted = true; return json({ succeeded: true }); }
      if (m === 'GET') return json({ appointment: a });
    }
    const cal = S.calendars.find((c) => c.id === seg[1]);
    if (cal) return json({ calendar: cal });
    return json({ message: 'not found' }, 404);
  }

  // ------------------------------------------------------------------- other
  if (seg[0] === 'businesses') {
    if (seg.length === 1 && m === 'GET') return json({ businesses: Object.values(S.businesses) });
    if (seg.length === 1 && m === 'POST') { const id = nid('bz'); S.businesses[id] = { id, ...body }; return json({ business: S.businesses[id] }, 201); }
    const b = S.businesses[seg[1]];
    if (!b) return json({ message: 'not found' }, 400);
    if (m === 'PUT') { if ('locationId' in (body || {})) return json({ message: ['property locationId should not exist'] }, 422); Object.assign(b, body); return json({ business: b }); }
    if (m === 'DELETE') { delete S.businesses[seg[1]]; return json({ succeded: true }); }
  }
  if (seg[0] === 'locations' && seg[2] === 'tags') return json({ tags: S.locationTags });
  if (seg[0] === 'locations' && seg[2] === 'customFields') return json({ customFields: S.customFields });
  if (seg[0] === 'conversations') {
    if (seg[1] === 'search') return json({ conversations: S.conversations });
    if (seg[1] === 'messages' && m === 'POST') {
      if (!body?.contactId || !body?.type) return json({ message: 'contactId/type required' }, 422);
      const msg = { id: nid('ms'), ...body, direction: 'outbound', dateAdded: now() };
      S.messages.push(msg);
      return json({ messageId: msg.id, conversationId: 'cv_' + body.contactId });
    }
    if (seg[2] === 'messages') return json({ messages: { messages: S.messages.filter((x) => x.conversationId === seg[1]) } });
    if (m === 'DELETE') return json({ success: true });
    return json({ id: seg[1], contactId: S.conversations.find((c) => c.id === seg[1])?.contactId });
  }
  if (seg[0] === 'proposals' && seg[1] === 'document') return json({ documents: S.documents, total: S.documents.length });

  return json({ message: `mock: no route for ${m} /${seg.join('/')}` }, 404);
}

Deno.serve({ port: PORT, onListen: () => console.log(`mock on ${PORT}`) }, async (req) => {
  const url = new URL(req.url);
  const p = url.pathname;

  if (p === '/__state') return json(S);
  if (p === '/__reset') { S = fresh(); return json({ ok: true }); }
  if (p === '/__seed') { const b = await req.json(); for (const [k, v] of Object.entries(b)) (S as any)[k] = v; return json({ ok: true }); }

  if (p.startsWith('/ghl/')) return handleGhl(req, p.slice(4), url);

  if (p === '/auth/v1/user') {
    const auth = req.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer /, '');
    try {
      const payload = JSON.parse(b64urlDecode(token.split('.')[1]));
      if (payload.role === 'authenticated' && payload.sub) {
        return json({ id: payload.sub, aud: 'authenticated', role: 'authenticated', email: payload.email || 'user@test', app_metadata: {}, user_metadata: {}, created_at: now() });
      }
    } catch { /* fallthrough */ }
    return json({ code: 401, msg: 'invalid JWT' }, 401);
  }

  if (p.startsWith('/rest/v1/')) {
    const target = `${POSTGREST}/${p.slice('/rest/v1/'.length)}${url.search}`;
    const headers = new Headers(req.headers);
    headers.delete('host');
    const res = await fetch(target, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer() });
    return new Response(res.body, { status: res.status, headers: res.headers });
  }

  if (p.startsWith('/functions/v1/')) {
    const name = p.split('/')[3];
    const port = FUNCTION_PORTS[name];
    if (!port) return json({ error: `function ${name} not running` }, 404);
    const headers = new Headers(req.headers);
    headers.delete('host');
    const res = await fetch(`http://127.0.0.1:${port}/${url.search}`, { method: req.method, headers, body: req.method === 'GET' ? undefined : await req.arrayBuffer() });
    return new Response(res.body, { status: res.status, headers: res.headers });
  }

  return json({ error: 'not found' }, 404);
});
