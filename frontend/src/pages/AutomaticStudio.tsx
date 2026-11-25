import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload } from '../components/Upload';
import { GamePlayer } from '../components/GamePlayer';
import { Playability } from '../components/Playability';
import { api, normalizedImage } from '../services/api';
import { generateGame } from '../services/automatic';
import { verifyRoute } from '../services/replay';
import { candidateBoxes } from '../services/recognition';
import { useStudio, fromLevel } from '../state';
import { emptyDraft, symbols } from '../types';
import { userMessage, userNotes } from '../services/messages';

export function AutomaticStudio() {
  const { draft, setDraft, ask } = useStudio();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [repairs, setRepairs] = useState(true);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, []);
  const source = draft.image || draft.generationImage;
  const report = draft.generation;
  const verified = report?.status === 'verified' && !!draft.level;
  const issues = report?.issues.filter((issue, i, all) => !issue.id || all.findIndex(other => other.id === issue.id) === i) || [];
  async function upload(file: File) {
    if (draft.dirty && (draft.level || draft.boxes.length) && !(await ask('Replace your unsaved game and drawing?'))) return;
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    setBusy('Preparing your image'); setError('');
    try {
      const image = await normalizedImage(file, abort.signal);
      if (!alive.current) return;
      setDraft({ ...emptyDraft(), mode: 'automatic', image: { ...image, file, name: file.name }, width: image.width, height: image.height, dirty: true });
      setCorrections({});
    } catch (e) { if (alive.current) setError(userMessage((e as Error).message)); }
    finally { if (alive.current) setBusy(''); }
  }
  async function generate() {
    if (!source) return;
    if (draft.generationImage && draft.dirty && !(await ask("Generating again will replace your edited game. Continue?"))) return;
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    setBusy('Reading your drawing and building your game'); setError('');
    setDraft(d => ({ ...d, generation: undefined, generationImage: undefined, image: source, width: source.width, height: source.height, boxes: [], mode: 'automatic', level: null, savedId: undefined, dirty: true }));
    try {
      const result = await generateGame(source.file, corrections, repairs, abort.signal);
      if (!alive.current || abort.signal.aborted) return;
      setDraft(d => ({ ...d, generation: result }));
      if (result.status === 'awaiting_phaser' && result.level && result.assessment?.path) {
        setBusy('Trying the game to check that the finish can be reached');
        let won = false;
        try { won = await verifyRoute(result.level, result.assessment.path, abort.signal); }
        catch (e) { if (!abort.signal.aborted) setError(userMessage((e as Error).message)); }
        if (!alive.current || abort.signal.aborted) return;
        const assessment = { ...result.assessment, verified_in_game: won, status: won ? 'reachable' as const : 'unknown' as const,
          reason: won ? 'Compare the game with your drawing to make sure it looks the way you intended.' : 'The test could not reach the finish. Try a clearer drawing or use Advanced Edit to change the layout.' };
        setDraft(d => ({ ...d, generation: { ...result, assessment, status: won ? 'verified' : 'replay_failed' }, level: won ? result.level : null, stage: won ? 'play' : 'edit' }));
      }
    } catch (e) { if (alive.current && !abort.signal.aborted) setError(userMessage((e as Error).message)); }
    finally { if (alive.current && !abort.signal.aborted) setBusy(''); }
  }
  function advanced() {
    if (!draft.generationImage && report?.level) {
      setDraft({ ...fromLevel(report.level), mode: 'automatic', generationImage: source, generation: report,
        savedId: draft.savedId, dirty: draft.dirty, stage: 'edit' });
    } else if (!draft.generationImage && draft.image && report) {
      const boxes = candidateBoxes(report).map((box, i) => ({ ...box, type: report.candidates[i].chosen_type || box.type }));
      setDraft(d => ({ ...d, boxes: boxes.filter((_, i) => !report.candidates[i].ignored_by_user), mode: 'manual', level: null, generation: undefined, stage: 'edit',
        worldWidth: report.level?.world.width || 960, worldHeight: report.level?.world.height || 540 }));
    }
    navigate('/studio?advanced=1');
  }
  async function save() {
    if (!verified || !draft.level) return;
    setBusy('Saving your game'); setError('');
    try {
      const record = await api.save(draft.level, draft.savedId);
      if (alive.current) setDraft(d => ({ ...d, savedId: record.id, dirty: false }));
    } catch (e) { if (alive.current) setError(userMessage((e as Error).message)); }
    finally { if (alive.current) setBusy(''); }
  }
  function downloadReport() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ file: source?.name, ...report }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'dreamcraft-generation-report.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <header className="page-heading"><div><div className="eyebrow">DRAW IT. TRY IT.</div><h1>Game studio</h1><p>Upload your level sketch and let DreamCraft build a game.</p></div>
      <button onClick={advanced} disabled={!!busy}>Advanced Edit</button></header>
    <ol className="steps" aria-label="Generation progress">{[['upload', 'Upload'], ['detection', 'Find shapes'], ['recognition', 'Read symbols'], ['geometry', 'Build level'], ['playability', 'Check jumps'], ['play', 'Play']].map(([key, label], i) => <li key={key} className={(i === 0 && draft.image) || report?.stages.includes(key) || (key === 'play' && verified) ? 'active' : ''}><span>{i+1}</span>{label}</li>)}</ol>
    {busy && <p className="notice loading" role="status">{busy}…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {verified && draft.level && <>
      <GamePlayer level={draft.level} />
      <div className="card actions"><button className="primary" disabled={!!busy || !draft.dirty} onClick={() => void save()}>{draft.savedId ? 'Save changes' : 'Save level'}</button><button onClick={advanced} disabled={!!busy}>Advanced Edit · correct this game</button></div>
      <p role="status">{draft.savedId && !draft.dirty ? 'Your game is saved.' : 'Your game is not saved yet.'}</p>
      <details className="card"><summary>Upload another drawing</summary><Upload busy={!!busy} onFile={file => void upload(file)} /></details>
    </>}
    {!verified && <section className="card"><Upload busy={!!busy} onFile={file => void upload(file)} />
      <label className="check-label"><input type="checkbox" checked={repairs} disabled={!!busy} onChange={e => setRepairs(e.target.checked)} />Allow small repairs to make jumps possible. Show me what changed.</label>
      <button className="primary" disabled={!source || !!busy} onClick={() => void generate()}>Generate My Game</button>
      <Link className="button" to="/studio?sample=trail">Try a sample game →</Link>
    </section>}
    {report && issues.length ? <section className="card"><h2>A little help is needed</h2><p>Answer the questions below so we can finish your game.</p><ul>{issues.map((issue, i) => <li key={i}>{issue.id ? `Drawing ${Number(issue.id.split('_').pop())+1}: ` : ''}{userMessage(issue.message)}</li>)}</ul>
      {report.candidates.filter(c => c.needs_correction).map(c => <label className="auto-correction" key={c.id}>
        {source && <svg role="img" aria-label={`Unclear drawing ${c.id}`} viewBox={`${c.x} ${c.y} ${c.width} ${c.height}`} width="90" height="90"><image href={source.url} width={source.width} height={source.height}/></svg>}
        What is this drawing?<select aria-label={`Correct ${c.id}`} value={corrections[c.id] || ''} disabled={!!busy} onChange={e => setCorrections(p => { const next = { ...p }; if (e.target.value) next[c.id] = e.target.value; else delete next[c.id]; return next; })}><option value="">Choose only if you know</option>{symbols.map(s => <option key={s.kind} value={s.kind}>{s.icon} {s.name}</option>)}<option value="ignore">Ignore this region</option></select>
      </label>)}
      <button disabled={!!busy} onClick={advanced}>Open Advanced Edit</button>
    </section> : null}
    {!!report?.changes.length && <p className="notice">{report.changes.length} small automatic adjustments were applied. Open Automatic adjustments below to see every change.</p>}
    {userNotes(report?.warnings).map(w => <p key={w} className="hint">{w}</p>)}
    {report?.assessment && <Playability result={report.assessment} />}
    {source && <details className="card"><summary>Your drawing and detected symbols</summary><img style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain' }} src={source.url} alt="Your original drawing"/><p>{source.name}</p>
      {report?.candidates.map((c, i) => <p key={c.id}>Drawing {i + 1}: {symbols.find(s => s.kind === (c.chosen_type || c.predicted_class))?.name || 'Not sure'}{typeof c.confidence === 'number' ? ` · suggestion ${Math.round(c.confidence*100)}%` : ''}{c.ignored_by_user ? ' · skipped' : ''}</p>)}
    </details>}
    {report && <details className="card"><summary>Automatic adjustments ({report.changes.length})</summary>
      {!report.changes.length && <p>No changes were needed.</p>}{report.changes.map((c, i) => <p key={i}>{c.kind === 'standard_size' ? c.after.type === 'coin' ? 'Used the standard coin size.' : 'Used the standard obstacle size for a single jump.' : c.kind === 'fit_hazard' ? 'Placed the barrier on its nearby platform.' : c.kind === 'add_bridge' ? 'Added a small platform across a gap.' : c.kind === 'align_to_platform' ? 'Placed the start or finish on its nearby platform.' : userMessage(c.reason)}</p>)}
      <button onClick={downloadReport}>Download changes</button>
    </details>}
  </>;
}
