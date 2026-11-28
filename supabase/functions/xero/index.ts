// Xero link for the Compton portal: connect (OAuth 2), create sales invoices in Xero, have Xero email them, read back payments.
// Secrets needed (Supabase → Edge Functions → Secrets): XERO_CLIENT_ID, XERO_CLIENT_SECRET.
// Redirect URI to register in the Xero app: <SUPABASE_URL>/functions/v1/xero
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SCOPES = 'openid profile email offline_access accounting.invoices accounting.contacts accounting.settings.read accounting.payments.read';
const API = 'https://api.xero.com/api.xro/2.0';
const URL_ = Deno.env.get('SUPABASE_URL')!;
const REDIRECT = URL_ + '/functions/v1/xero';
const CID = Deno.env.get('XERO_CLIENT_ID') || '', CSEC = Deno.env.get('XERO_CLIENT_SECRET') || '';
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const basic = () => 'Basic ' + btoa(CID + ':' + CSEC);

async function tokenCall(params: Record<string, string>) {
  const r = await fetch('https://identity.xero.com/connect/token', { method: 'POST', headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const t = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Xero sign-in failed: ' + (t.error_description || t.error || r.status));
  return t;
}
async function auth() {
  const { data: a } = await admin.from('xero_auth').select('*').eq('id', 1).maybeSingle();
  if (!a || !a.refresh_token) throw new Error('Xero is not connected yet – connect it on the Invoices page.');
  if (a.access_token && new Date(a.expires_at).getTime() > Date.now() + 90_000) return a;
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: a.refresh_token });
  const upd = { access_token: t.access_token, refresh_token: t.refresh_token || a.refresh_token, expires_at: new Date(Date.now() + (t.expires_in || 1800) * 1000).toISOString(), updated_at: new Date().toISOString() };
  await admin.from('xero_auth').update(upd).eq('id', 1);
  return { ...a, ...upd };
}
async function xero(path: string, init: RequestInit & { accept?: string } = {}) {
  const a = await auth();
  const r = await fetch(API + path, { ...init, headers: { Authorization: 'Bearer ' + a.access_token, 'xero-tenant-id': a.tenant_id, Accept: init.accept || 'application/json', 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (init.accept === 'application/pdf') { if (!r.ok) throw new Error('Xero PDF failed (' + r.status + ')'); return new Uint8Array(await r.arrayBuffer()); }
  const t = await r.json().catch(() => ({}));
  if (!r.ok) {
    const ve = (t.Elements || []).flatMap((e: any) => [...(e.ValidationErrors || []), ...((e.LineItems || []).flatMap((l: any) => l.ValidationErrors || []))]).map((v: any) => v.Message);
    throw new Error('Xero: ' + (ve.length ? [...new Set(ve)].join('; ') : t.Detail || t.Message || t.Title || r.status));
  }
  return t;
}
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromXeroDate = (d: string | undefined) => { if (!d) return null; const m = /Date\((\d+)/.exec(d); return m ? new Date(+m[1]).toISOString().slice(0, 10) : String(d).slice(0, 10); };

async function syncInvoice(row: any) {
  const t = await xero('/Invoices/' + row.xero_invoice_id);
  const x = t.Invoices[0];
  const upd: any = { status: x.Status, number: x.InvoiceNumber, net: x.SubTotal, vat: x.TotalTax, total: x.Total, amount_paid: x.AmountPaid, amount_due: x.AmountDue, paid_at: fromXeroDate(x.FullyPaidOnDate), sent_at: row.sent_at || (x.SentToContact ? new Date().toISOString() : null), updated_at: new Date().toISOString() };
  await admin.from('invoices').update(upd).eq('id', row.id);
  return { ...row, ...upd };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const u = new URL(req.url);
  // ---- OAuth callback from Xero (browser redirect, no portal sign-in header) ----
  if (req.method === 'GET') {
    const state = u.searchParams.get('state') || '', code = u.searchParams.get('code');
    const { data: st } = await admin.from('xero_oauth_state').select('*').eq('state', state).maybeSingle();
    const back = (st?.return_url || '').replace(/#.*$/, '');
    const go = (msg: string) => new Response(null, { status: 302, headers: { Location: (back || 'about:blank') + '#/p-invoices?xero=' + encodeURIComponent(msg) } });
    if (!st) return new Response('This Xero link has expired – start again from the portal.', { status: 400 });
    await admin.from('xero_oauth_state').delete().eq('state', state);
    if (!code) return go(u.searchParams.get('error') || 'cancelled');
    try {
      const t = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT });
      const cr = await fetch('https://api.xero.com/connections', { headers: { Authorization: 'Bearer ' + t.access_token } });
      const cons = await cr.json();
      const org = (cons || []).find((c: any) => c.tenantType === 'ORGANISATION') || (cons || [])[0];
      if (!org) return go('no-organisation');
      await admin.from('xero_auth').upsert({ id: 1, tenant_id: org.tenantId, tenant_name: org.tenantName, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + (t.expires_in || 1800) * 1000).toISOString(), scopes: t.scope || SCOPES, connected_by: st.created_by, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return go('connected');
    } catch (e) { return go('error: ' + String((e as Error).message || e).slice(0, 150)); }
  }

  try {
    // ---- portal calls: staff only ----
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who } = await admin.auth.getUser(jwt);
    if (!who?.user) return json({ error: 'Not signed in' }, 401);
    const { data: staff } = await admin.from('staff').select('role,name').eq('user_id', who.user.id).maybeSingle();
    if (!staff) return json({ error: 'Staff only' }, 403);
    const body = await req.json().catch(() => ({}));
    const A = body.action;

    if (A === 'status') {
      const { data: a } = await admin.from('xero_auth').select('tenant_name,connected_at,connected_by,refresh_token').eq('id', 1).maybeSingle();
      return json({ configured: !!(CID && CSEC), connected: !!a?.refresh_token, tenant: a?.tenant_name || null, connected_at: a?.connected_at || null, connected_by: a?.connected_by || null, redirect_uri: REDIRECT });
    }
    if (A === 'auth_url') {
      if (!CID || !CSEC) return json({ error: 'The Xero app keys have not been added to Supabase yet.' }, 400);
      const state = crypto.randomUUID();
      await admin.from('xero_oauth_state').insert({ state, return_url: String(body.return_url || ''), created_by: staff.name || who.user.email });
      const q = new URLSearchParams({ response_type: 'code', client_id: CID, redirect_uri: REDIRECT, scope: SCOPES, state });
      return json({ url: 'https://login.xero.com/identity/connect/authorize?' + q });
    }
    if (A === 'disconnect') {
      if (staff.role !== 'admin') return json({ error: 'Admins only' }, 403);
      await admin.from('xero_auth').delete().eq('id', 1);
      return json({ ok: true });
    }
    if (A === 'accounts') {
      const t = await xero('/Accounts?where=' + encodeURIComponent('Class=="REVENUE"&&Status=="ACTIVE"'));
      return json({ accounts: (t.Accounts || []).map((a: any) => ({ code: a.Code, name: a.Name, tax: a.TaxType })) });
    }
    if (A === 'contacts') {
      const q = String(body.q || '').trim(); if (q.length < 2) return json({ contacts: [] });
      const t = await xero('/Contacts?searchTerm=' + encodeURIComponent(q) + '&summaryOnly=true');
      return json({ contacts: (t.Contacts || []).slice(0, 15).map((c: any) => ({ id: c.ContactID, name: c.Name, email: c.EmailAddress || '' })) });
    }
    if (A === 'create') {
      const { data: row } = await admin.from('invoices').select('*').eq('id', body.id).maybeSingle();
      if (!row) return json({ error: 'Invoice not found' }, 404);
      if (row.xero_invoice_id) return json({ error: 'Already in Xero as ' + row.number }, 400);
      const { data: set } = await admin.from('xero_settings').select('*').eq('id', 1).maybeSingle();
      // contact: use the one picked, else match by name, else create
      let cid = row.xero_contact_id, cur: any = null;
      if (cid) cur = (await xero('/Contacts/' + cid)).Contacts?.[0];
      else { const f = await xero('/Contacts?where=' + encodeURIComponent('Name=="' + row.customer.replace(/"/g, '') + '"')); cur = f.Contacts?.[0]; cid = cur?.ContactID; }
      if (!cid) { const c = await xero('/Contacts', { method: 'POST', body: JSON.stringify({ Contacts: [{ Name: row.customer, EmailAddress: row.contact_email || undefined }] }) }); cid = c.Contacts[0].ContactID; }
      else if (row.contact_email && (!cur?.EmailAddress || body.update_email)) await xero('/Contacts', { method: 'POST', body: JSON.stringify({ Contacts: [{ ContactID: cid, EmailAddress: row.contact_email }] }) });
      const tax = set?.tax_type || 'OUTPUT2';
      const LineItems = (row.lines || []).map((l: any) => ({ Description: l.desc, Quantity: +l.qty || 1, UnitAmount: +l.rate || 0, AccountCode: l.account || set?.sales_account || undefined, TaxType: l.tax || tax }));
      if (!LineItems.length) return json({ error: 'The invoice has no lines' }, 400);
      if (LineItems.some((l: any) => !l.AccountCode)) return json({ error: 'Choose the Xero sales account first (Invoices page → Xero settings).' }, 400);
      const inv: any = { Type: 'ACCREC', Contact: { ContactID: cid }, LineItems, LineAmountTypes: 'Exclusive', Date: row.issue_date, DueDate: row.due_date, Reference: row.reference || undefined, Status: body.draft ? 'DRAFT' : 'AUTHORISED' };
      if (set?.branding_theme_id) inv.BrandingThemeID = set.branding_theme_id;
      const t = await xero('/Invoices', { method: 'POST', body: JSON.stringify({ Invoices: [inv] }) });
      const x = t.Invoices[0];
      let online = null; try { const o = await xero('/Invoices/' + x.InvoiceID + '/OnlineInvoice'); online = o.OnlineInvoices?.[0]?.OnlineInvoiceUrl || null; } catch (_) { /* drafts have none */ }
      const upd = { xero_invoice_id: x.InvoiceID, xero_contact_id: cid, number: x.InvoiceNumber, status: x.Status, net: x.SubTotal, vat: x.TotalTax, total: x.Total, amount_due: x.AmountDue, amount_paid: x.AmountPaid, online_url: online, updated_at: new Date().toISOString() };
      await admin.from('invoices').update(upd).eq('id', row.id);
      return json({ ok: true, invoice: { ...row, ...upd } });
    }
    if (A === 'email') {
      const { data: row } = await admin.from('invoices').select('*').eq('id', body.id).maybeSingle();
      if (!row?.xero_invoice_id) return json({ error: 'Create the invoice in Xero first' }, 400);
      await xero('/Invoices/' + row.xero_invoice_id + '/Email', { method: 'POST', body: '{}' });
      await admin.from('invoices').update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id);
      return json({ ok: true });
    }
    if (A === 'refresh') {
      let q = admin.from('invoices').select('*').not('xero_invoice_id', 'is', null);
      q = body.id ? q.eq('id', body.id) : q.neq('status', 'PAID').neq('status', 'VOIDED').neq('status', 'DELETED');
      const { data: rows } = await q;
      const out = []; for (const r of rows || []) { try { out.push(await syncInvoice(r)); } catch (e) { out.push({ ...r, error: String((e as Error).message) }); } }
      return json({ ok: true, invoices: out });
    }
    if (A === 'pdf') {
      const { data: row } = await admin.from('invoices').select('xero_invoice_id,number').eq('id', body.id).maybeSingle();
      if (!row?.xero_invoice_id) return json({ error: 'Not in Xero yet' }, 400);
      const pdf = await xero('/Invoices/' + row.xero_invoice_id, { accept: 'application/pdf' }) as Uint8Array;
      return json({ name: (row.number || 'invoice') + '.pdf', base64: b64(pdf) });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
