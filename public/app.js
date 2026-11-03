const $ = id => document.getElementById(id);
const source = $('source');
const script = $('script');
const synth = window.speechSynthesis;
let generating = false;
let playing = false;
let paused = false;
let speechRun = 0;
let utterance;
const sampleSource = 'The epistemological distinction between knowledge and mere true belief cannot be reduced to the correspondence of a proposition with reality. An agent may hold a belief that is, contingently, true, yet lack adequate justification for holding it. Nevertheless, justification itself does not straightforwardly resolve this difficulty, since the evidential grounds upon which an agent relies may be defective in ways that are not apparent to the agent. Thus, even a justified true belief may fail to constitute knowledge when its truth is attributable to epistemic luck.';
const sampleScript = 'Being right about something is not always the same as knowing it. You can believe something true and still have no good reason to believe it.\n\nThink of it this way. You guess that it is raining in another city. By chance, it is. Your belief matches reality. But a lucky guess does not seem to count as knowledge.\n\nSo perhaps knowledge needs something more: a good reason for your belief. That sounds promising. But the passage points to another problem. Even a reason that seems good to you can depend on evidence that is faulty in a way you cannot see.\n\nFor example, imagine looking at a clock that says three o’clock. You have every reason to trust it. What you do not know is that the clock stopped exactly twelve hours ago. By coincidence, you look at it when it really is three o’clock. Your belief is true, and you have what seems to be a good reason for it. Yet the broken clock has led you to the truth by luck.\n\nThat is the key difficulty. A true belief, even one supported by apparently good reasons, can still fall short of knowledge if it happens to be true because of luck.';
const importControl = document.querySelector('.import-button');
importControl.tabIndex = 0;
importControl.setAttribute('role', 'button');
importControl.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('upload').click(); }
});
function message(text, error = false) { $('message').textContent = text; $('message').hidden = !text; $('message').classList.toggle('error', error); }
function words(text) { return text.trim() ? text.trim().split(/\s+/u).length : 0; }
function updateSource() { $('source-count').textContent = `${source.value.length.toLocaleString()} / 40,000 characters`; $('generate').disabled = !source.value.trim() || generating; }
function updateScript() {
  const hasScript = Boolean(script.value.trim());
  $('empty').hidden = hasScript; script.hidden = !hasScript;
  $('copy').disabled = $('download').disabled = !hasScript;
  $('play').disabled = !hasScript || !synth;
  const count = words(script.value);
  $('script-stats').textContent = hasScript ? `${count} words · about ${Math.max(1, Math.ceil(count / (150 * Number($('speed').value))))} min listening` : 'A fresh perspective starts here.';
}
function stop() { speechRun++; synth?.cancel(); utterance = undefined; playing = paused = false; $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Read script aloud'); $('play-state').textContent = 'Listen to the idea'; $('stop').disabled = true; }
function setScript(text) { stop(); script.value = text; updateScript(); }
source.addEventListener('input', updateSource);
script.addEventListener('input', () => { stop(); updateScript(); });
$('clear').addEventListener('click', () => { source.value = ''; updateSource(); source.focus(); message(''); });
$('sample').addEventListener('click', () => {
  if (generating) return;
  source.value = sampleSource; updateSource(); setScript(sampleScript); $('output-tag').textContent = 'SAMPLE SCRIPT';
  message('This is a prewritten example. Paste your own passage and generate to create a new script.');
});
$('upload').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (!file.name.toLowerCase().endsWith('.txt')) throw new Error('Choose a plain text (.txt) file.');
    if (file.size > 200_000) throw new Error('This file is too large. Import a shorter passage.');
    const text = await file.text();
    if (text.length > 40_000) throw new Error('Use at most forty thousand characters per passage.');
    source.value = text; updateSource(); message('Text imported. Ready when you are.');
  } catch (error) { message(error.message, true); }
  event.target.value = '';
});
$('generate').addEventListener('click', async () => {
  if (generating || !source.value.trim()) return;
  generating = true; updateSource(); $('sample').disabled = true; $('generate').textContent = 'Finding the thread…';
  document.querySelector('.output-pane').classList.add('loading');
  message('Following the argument, preserving the nuance, and shaping it for listening…');
  try {
    const response = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: source.value }), signal: AbortSignal.timeout(190_000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The script could not be generated. Please try again.');
    setScript(data.script); $('output-tag').textContent = 'READY TO LISTEN';
    message('Your spoken version is ready. You can edit it, listen, or take it with you.');
  } catch (error) { message(error.name === 'TimeoutError' ? 'Generation took too long. Try a shorter passage.' : error.message || 'Could not connect to Narrator.', true); }
  finally { generating = false; updateSource(); $('sample').disabled = false; $('generate').innerHTML = 'Make it listenable <span aria-hidden="true">→</span>'; document.querySelector('.output-pane').classList.remove('loading'); }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(script.value); message('Script copied.'); } catch { script.focus(); script.select(); message('Clipboard access is unavailable. The script is selected so you can copy it.'); }
});
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([script.value], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'narrator-script.txt'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('stop').addEventListener('click', stop);
$('speed').addEventListener('change', () => { stop(); updateScript(); });
$('play').addEventListener('click', () => {
  if (!synth || !script.value.trim()) return;
  if (playing) {
    if (paused) { synth.resume(); paused = false; $('play').textContent = 'Ⅱ'; $('play-state').textContent = 'Reading aloud'; $('play').setAttribute('aria-label', 'Pause playback'); }
    else { synth.pause(); paused = true; $('play').textContent = '▶'; $('play-state').textContent = 'Paused'; $('play').setAttribute('aria-label', 'Resume playback'); }
    return;
  }
  stop(); const run = speechRun;
  playing = true; $('stop').disabled = false; $('play').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', 'Pause playback'); $('play-state').textContent = 'Reading aloud';
  // Queue short utterances sequentially to avoid browser limits on long speech.
  const chunks = script.value.match(/[^.!?]+[.!?]+(?:["”’']|\s)*|[^.!?]+$/g) || [script.value];
  let index = 0;
  function next() {
    if (run !== speechRun) return;
    if (index === chunks.length) { stop(); return; }
    utterance = new SpeechSynthesisUtterance(chunks[index++]); utterance.lang = 'en-US'; utterance.rate = Number($('speed').value);
    utterance.onend = next;
    utterance.onerror = event => { if (run !== speechRun) return; stop(); if (event.error !== 'canceled' && event.error !== 'interrupted') message('Your browser could not play this voice. Try another browser, or download the script for your TTS engine.', true); };
    synth.speak(utterance);
  }
  next();
});
window.addEventListener('pagehide', stop);
if (!synth) { $('script-hint').textContent = 'Read-aloud unavailable in this browser'; }
fetch('/api/status').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => {
  $('connection').textContent = data.configured ? '●  AI connected · studio ready' : '○  Sample ready · AI key needed for generation';
}).catch(() => { $('connection').textContent = '○  Server unavailable'; });
updateSource(); updateScript();
