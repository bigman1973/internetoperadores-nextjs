require('dotenv').config();
const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim();
console.log('Key exists:', !!HUBSPOT_API_KEY, 'Length:', HUBSPOT_API_KEY.length);

async function main() {
  const res = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
    headers: { Authorization: 'Bearer ' + HUBSPOT_API_KEY }
  });
  const data = await res.json();
  if (data.results) {
    console.log('Pipelines encontrados:', data.results.length);
    data.results.forEach(p => {
      console.log(' -', p.label, '(id:', p.id, ')');
      if (p.stages) {
        p.stages.forEach(s => console.log('    Stage:', s.label, '(id:', s.id, ')'));
      }
    });
  } else {
    console.log('Error:', JSON.stringify(data));
  }
}
main().catch(e => console.error('Error:', e.message));
