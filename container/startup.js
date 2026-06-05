const { exec } = require('child_process');
const { promisify } = require('util');
const { appendFileSync } = require('fs');
const execPromise = promisify(exec);

(async () => {
  // Step 0: Install PM2 globally (required before starting any app)
  console.log('📦 Installing PM2 globally...');
  await execPromise('sudo npm install -g pm2', { stdio: 'inherit' });
  console.log('✓ PM2 global install done');

  // Step 1: Run WEB, KEX STORAGE, and ALIASES blocks in parallel
  const webSetup = async () => {
    const webPath = '/root/container/web';
    console.log('🚀 WEB: installing dependencies...');
    await execPromise('sudo npm install', { cwd: webPath, stdio: 'inherit' });
    await execPromise('pm2 start index.js --name web', { cwd: webPath, stdio: 'inherit' });
    await execPromise('pm2 save', { stdio: 'inherit' });
    console.log('✓ WEB block finished');
  };

  const storageSetup = async () => {
    const storagePath = '/root/container/kex-storage';
    console.log('📁 KEX STORAGE: installing dependencies...');
    await execPromise('sudo npm install', { cwd: storagePath, stdio: 'inherit' });
    await execPromise('pm2 start index.js --name ks', { cwd: storagePath, stdio: 'inherit' });
    await execPromise('pm2 save', { stdio: 'inherit' });
    console.log('✓ KEX STORAGE block finished');
  };

  const aliasesSetup = () => {
    const aliases = `
# Custom aliases for easy navigation
alias c='cd /root/container/'
alias cw='cd /root/container/web/'
alias ks='cd /root/container/kex-storage/'
`;
    appendFileSync('/root/.bashrc', aliases);
    console.log('✓ USEFUL ALIASES block finished');
  };

  // Run all three concurrently
  await Promise.all([
    webSetup(),
    storageSetup(),
    aliasesSetup()
  ]);

  console.log('🎉 All blocks completed successfully!');
})().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
