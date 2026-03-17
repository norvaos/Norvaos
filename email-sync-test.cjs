async function main() {
  console.log('Triggering sync via POST /api/cron/microsoft-sync...');
  const res = await fetch('http://localhost:3000/api/cron/microsoft-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer staging-cron-secret-norvaos-2026',
    },
  });
  
  const body = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', body);
}
main();
