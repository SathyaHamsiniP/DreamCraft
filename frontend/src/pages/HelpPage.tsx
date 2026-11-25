import { Link } from "react-router-dom";
import { symbols } from "../types";

export function HelpPage() {
  return <>
    <header className="page-heading">
      <div><div className="eyebrow">A HAND WHEN YOU NEED IT</div><h1>Let's make a game.</h1><p>Draw a level, upload it, and try your game.</p></div>
      <Link className="button primary" to="/studio">Open studio →</Link>
    </header>
    <div className="help-grid">
      <section className="card">
        <h2>1. Draw your level</h2>
        <div className="help-symbols">{symbols.map(s => <p key={s.kind} className={s.kind}><b>{s.icon} {s.drawing} → {s.name}</b></p>)}</div>
        <p>Use a dark pen on white paper. Draw horizontal rectangles for platforms, circles for coins and upward triangles for obstacles. Mark the start with one capital S and the finish with one capital G.</p>
        <p>Leave space between symbols where you can. Put a platform under the start and finish, and keep gaps and steps small enough to jump across.</p>
        <h2>2. Upload your drawing</h2>
        <p>Open Studio and choose a PNG or JPEG photo, or drag it onto the upload area. Use an image under 5 MB with no side longer than 4096 pixels.</p>
        <p>Choose Generate My Game and wait while your drawing is turned into a level. If a symbol is unclear, choose what you meant from the options shown. You can also try a sample game without uploading a drawing.</p>
        <h2>3. Check any changes</h2>
        <p>DreamCraft can make small changes to help the player get through the level, such as adding a short step across a gap or making an obstacle easier to jump over. Open Automatic adjustments to see what changed.</p>
        <p>For more control, open Advanced Edit. Drag boxes to move them, drag their corners to resize them, and change any incorrect symbols. Choose Approve all once the boxes look right. Existing boxes stay approved while you adjust them; a new box needs approval before you create the game.</p>
      </section>
      <section className="card">
        <h2>4. Play your game</h2>
        <p>Choose Start game above the game area. Use the left and right arrow keys, or A and D, to move. Press Space, W or the up arrow to jump. Jump over gaps and red barriers, then touch the purple portal to finish.</p>
        <p>Gold coins add bonus points, but you do not need every coin to finish. Choose Restart or press R to begin another attempt straight away.</p>
        <h2>5. Save it for later</h2>
        <p>Choose Save level to keep your game. Open My Levels whenever you want to play it again or make changes. After editing a saved game, choose Save changes.</p>
        <h2>What does the game check tell me?</h2>
        <p>A path found by the checker is a possible way to the finish. It has only been tried in the game when the result says an automatic test reached the finish. You should still play it yourself to see how the jumps feel.</p>
        <p>If the finish is too high or a gap needs changing, the result explains what to fix. If the check cannot decide, that does not mean the level is impossible. You can try it yourself or change the layout in Advanced Edit.</p>
        <h2>What if my drawing cannot be read?</h2>
        <p>Try a brighter photo with clear, separate symbols. If automatic generation is unavailable, try a sample or use Advanced Edit to choose the symbols yourself. Samples are ready-made games, not results from your drawing.</p>
      </section>
    </div>
  </>;
}
