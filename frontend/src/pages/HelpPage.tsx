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
          <h2>2. Upload and find candidates</h2>
          <p>
            Choose a PNG or JPEG, up to 5 MiB, 4096 pixels per side and 12
            million pixels total. OpenCV suggests boxes around ink. It does not
            know the object types. Blank sheets can still be edited manually.
          </p>
          <h2>3. Review every object</h2>
          <p>
            Select a box, drag it to move it, or drag its bottom-right corner to
            resize it. Numeric fields also work with a keyboard. Use Add box or
            Draw box for missed drawings. Delete noise boxes. Choose a type and
            confirm your review for each object.
          </p>
          <p>
            Changes clear that object's review. Positions are in the oriented
            image pixels shown on screen. Create level sends the reviewed boxes
            to the backend, which checks the game rules.
          </p>
        </section>
        <section className="card">
          <h2>4. Try your world</h2>
          <p>
            Press Start game. Use Left and Right, or A and D, to move. Space, W
            or Up jumps. Enter starts and R restarts. A keyboard is needed to
            play. The green spawn box becomes the player; the purple goal is the
            finish.
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
            The real handwriting dataset and trained model are not ready. The
            studio supports manually reviewed sketches without weights. There
            are no invented confidence scores. Real photo detection and
            handwriting accuracy still need testing.
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
