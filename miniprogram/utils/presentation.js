function progress(tasks) {
  const total = tasks.length;
  const done = tasks.filter(task => task.done === true).length;
  return { total, done, percent: total ? Math.round(done * 100 / total) : 0 };
}
function countdown(date, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.parse(date + 'T00:00:00Z') - today) / 86400000);
}
function tableLayout(capacity, guests) {
  const occupants = [];
  guests.forEach(guest => {
    for (let i = 0; i < guest.partySize; i += 1) occupants.push({ name: i ? '同行' : guest.name, guestId: guest.id });
  });
  return Array.from({ length: capacity }, (_, i) => {
    const angle = (2 * Math.PI * i / capacity) - Math.PI / 2;
    const person = occupants[i];
    return { index: i, label: person ? person.name.slice(0, 3) : String(i + 1), filled: !!person,
      style: 'left:' + (50 + 40 * Math.cos(angle)).toFixed(2) + '%;top:' + (50 + 40 * Math.sin(angle)).toFixed(2) + '%;' };
  });
}
module.exports = { progress, countdown, tableLayout };
