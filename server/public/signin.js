const $ = id => document.getElementById(id);
let create = false, needsSetup = false, canSetup = false;
function render() {
  create = needsSetup || location.hash === '#create';
  $('authTitle').textContent = create ? 'Create your account.' : 'Welcome back.';
  $('authHelp').textContent = create ? 'Choose a username and a password of at least 5 characters.' : 'Sign in to start a conversation.';
  $('authSubmit').textContent = create ? 'Create account' : 'Sign in';
  $('password').autocomplete = create ? 'new-password' : 'current-password';
  $('password').minLength = create ? 5 : 1;
  $('confirmArea').hidden = !create; $('confirmPassword').required = create;
  $('accountPrompt').textContent = create ? 'Already have an account?' : 'New to Swing?';
  $('accountLink').textContent = create ? 'Sign in' : 'Create an account';
  $('accountLink').href = create ? '/signin' : '/signin#create';
  $('authForm').hidden = needsSetup && !canSetup;
  if ($('authForm').hidden) $('authHelp').textContent = 'Create the first account on the PC at http://127.0.0.1:3000. After that, you can create accounts from any device on your Wi-Fi.';
  $('authSubmit').disabled = false;
  $('authMessage').textContent = '';
}
async function initialize() {
  try {
    const response = await fetch('/api/auth/status');
    if (!response.ok) throw Error('Cannot check sign-in status. Try reloading.');
    const data = await response.json();
    if (data.signedIn) { location.replace('/'); return; }
    needsSetup = data.needsSetup; canSetup = data.canSetup; render();
  } catch (error) { $('authMessage').textContent = error.message; }
}
window.addEventListener('hashchange', () => { $('password').value = ''; $('confirmPassword').value = ''; render(); });
$('authForm').onsubmit = async event => {
  event.preventDefault();
  if (create && $('password').value !== $('confirmPassword').value) { $('authMessage').textContent = 'Passwords do not match.'; return; }
  $('authSubmit').disabled = true; $('authMessage').textContent = create ? 'Creating account…' : 'Signing in…';
  try {
    const response = await fetch(create ? '/api/auth/register' : '/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:$('username').value,password:$('password').value})});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Sign-in failed.');
    $('password').value = ''; $('confirmPassword').value = ''; location.replace('/');
  } catch (error) { $('authMessage').textContent = error.message; $('authSubmit').disabled = false; }
};
initialize();
