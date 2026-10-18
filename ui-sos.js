/* CARE frontend: SOS WhatsApp alerts that are really sent.
   When the server has a WhatsApp API set up (S.wa.configured, see whatsapp.js and the README), the two WhatsApp buttons in the SOS window
   ("WhatsApp" next to a contact, and "WhatsApp SOS to All Contacts") send the message by themselves instead of opening the WhatsApp app.
   When no API is set up the buttons no longer open WhatsApp: they say what is missing. No existing function is edited. Loaded after ui-home.js. */
(function () {
  const on = () => typeof S !== 'undefined' && S && S.wa && S.wa.configured;
  const activeSos = () => (S.sos || []).find(s => s.status !== 'Resolved');
  let busy = false;
  async function sendWa(id, phone) {
    if (busy) return; busy = true; toast('Sending WhatsApp alert…');
    try {
      const j = await api('sosWhatsApp', phone ? { id, phone } : { id });
      if (!j) return;                                   /* api() already showed the reason */
      if (j.configured === false) return toast('Automatic WhatsApp is not set up on this server.');
      const f = j.failed || [];
      if (j.sent && !f.length) toast(`WhatsApp alert sent to ${j.sent} contact${j.sent === 1 ? '' : 's'}.`);
      else if (j.sent) toast(`Sent to ${j.sent}. Not sent to ${f.map(x => x.n).join(', ')}: ${f[0].why}`);
      else toast(`Not sent: ${f.length ? f[0].why : 'no contacts.'}`);
    } finally { busy = false }
  }
  const a0 = window.alertAllWhatsApp;
  const needSetup = () => toast('WhatsApp cannot send by itself yet: add your Twilio or Meta keys to the .env file and restart (see README). Nothing was opened.');
  window.alertAllWhatsApp = function (id) { return on() ? sendWa(id) : needSetup() };
  /* the small "WhatsApp" button next to one contact is a link: catch the click when automatic sending is available */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="https://api.whatsapp.com/send"]'); if (!a) return;
    if (!on()) { e.preventDefault(); return needSetup() }
    const s = activeSos(); if (!s) return;
    let ph = ''; try { ph = new URL(a.href).searchParams.get('phone') || '' } catch (x) { }
    e.preventDefault(); sendWa(s.id, ph);
  }, true);
  /* Pressing SOS: the server now sends the WhatsApp alert by itself. Tell the person what happened, from the SOS timeline. */
  const api0 = window.api;
  if (typeof api0 === 'function') window.api = async function (type) {
    const j = await api0.apply(this, arguments);
    if (type === 'sos' && j && j.id && typeof S !== 'undefined' && S && S.wa) {
      if (!S.wa.configured) toast('SOS sent. Automatic WhatsApp is not set up on this server yet, so no WhatsApp message went out.');
      else if (!(S.contacts || []).length) toast('SOS sent. Add trusted contacts so CARE can WhatsApp them next time.');
      else { toast('SOS sent. Sending WhatsApp alerts to your trusted contacts…'); setTimeout(async () => {
        try { if (typeof load === 'function') await load() } catch (e) { }
        const tl = ((S.sos || []).find(x => x.id === j.id) || {}).tl || [], t = tl.map(x => x[0]);
        const ok = t.find(x => /^WhatsApp alert sent/.test(x)), no = t.find(x => /^WhatsApp (not delivered|alert not sent)/.test(x));
        toast(no || ok || 'WhatsApp alerts are on their way.');
      }, 5000) }
    }
    return j;
  };
})();
