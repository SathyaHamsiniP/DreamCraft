import { Link } from "react-router-dom";
import { symbols } from "../types";
export function HelpPage() {
  return (
    <>
      <header className="page-heading">
        <div>
          <div className="eyebrow">A HAND WHEN YOU NEED IT</div>
          <h1>Let's make a game.</h1>
          <p>A few simple steps from your first drawing to the finish line.</p>
        </div>
        <Link className="button primary" to="/studio">
          Open studio →
        </Link>
      </header>
      <div className="help-grid">
        <section className="card">
          <h2>1. Draw five kinds of objects</h2>
          <div className="help-symbols">
            {symbols.map((s) => (
              <p key={s.kind} className={s.kind}>
                <b>
                  {s.icon} {s.drawing} → {s.name}
                </b>
              </p>
            ))}
          </div>
          <p>
            Use dark strokes on white paper. Keep symbols apart. Add one S for
            the player's spawn and one G for the goal. Draw platforms below them
            so the player has somewhere to stand.
          </p>
          <h2>2. Upload and generate</h2>
          <p>
            Choose a PNG or JPEG, up to 5 MiB, 4096 pixels per side and 12
            million pixels total. OpenCV suggests boxes around ink. It does not
            know the object types. Blank sheets can still be edited manually.
          </p>
          <p>Click Generate My Game. DreamCraft runs the local CNN, calculates geometry and searches for a route. It shows a game only after a route reaches the goal in Phaser. If a drawing is unclear, answer just the questions shown. Missing or broken checkpoints do not produce recognition results.</p>
          <h2>3. Small repairs and Advanced Edit</h2>
          <p>You can allow small automatic repairs. The tool may align spawn or goal to a nearby platform, or try one short bridge. Every change appears under Automatic adjustments. Larger gaps, touching symbols and unclear layouts may need your help.</p>
          <p>Advanced Edit keeps the original manual tools. Select, move or resize boxes, add missed objects, delete noise, choose labels and review each object. Only this optional mode asks for coordinates or world dimensions. Open the original sketch to compare it with the generated game.</p>
        </section>
        <section className="card">
          <h2>4. Try your world</h2>
          <p>
            Press Start game. Use Left and Right, or A and D, to move. Space, W
            or Up jumps. Enter starts and R restarts. A keyboard is needed to
            play. The green spawn box becomes the blue explorer. Touch the purple
            finish flag to win. Gold coins are optional: each gives one bonus
            point, and you can finish without collecting them. Sketch levels
            share the same art and controls; your drawing decides the layout.
          </p>
          <h2>5. Save and check</h2>
          <p>
            Save level writes to the backend's SQLite database. My Levels loads
            those saved records. Check playability asks to save current changes
            first. A route found in the Python checker is not automatically
            verified in Phaser.
          </p>
          <h2>What do the results mean?</h2>
          <ul>
            <li>
              <b>Reachable:</b> the simulation found a route. Try it in the game
              too.
            </li>
            <li>
              <b>Unreachable:</b> the checker found a specific reason, shown in
              the result.
            </li>
            <li>
              <b>Unknown:</b> the search could not decide. It does not prove the
              level is impossible.
            </li>
          </ul>
          <h2>Samples, mock mode and real recognition</h2>
          <p>
            Sample games come from predefined project JSON files. They are not
            generated from an uploaded image. The backend also has a separate
            mock route for development fixtures; the studio does not use it for
            detection.
          </p>
          <p>
            A locally configured CNN can suggest object types and confidence scores.
            Automatic mode checks confidence, crop stability and basic shape clues, but mistakes are still possible. Without weights, use Advanced Edit to label manually. Public dataset scores do not measure full-photo accuracy.
          </p>
          <h2>Collect training samples</h2>
          <p>
            The separate local collection tool saves labeled symbol crops, sheet
            IDs and contributor codes. Start it with{" "}
            <code>python -m sketch.app</code>, then{" "}
            <a href="http://127.0.0.1:7860" target="_blank" rel="noreferrer">
              open the collection tool →
            </a>
            . Game saves and training samples are separate.
          </p>
          <h2>Need to correct a saved game?</h2>
          <p>
            Open it in My Levels and choose Back to editor. Those boxes use
            game-world coordinates. Make changes, confirm the affected objects,
            create the updated level, then Save changes. Keep spawn at the
            shared fixed player size.
          </p>
        </section>
      </div>
    </>
  );
}
