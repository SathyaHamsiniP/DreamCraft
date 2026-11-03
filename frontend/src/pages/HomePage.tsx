import { Link } from "react-router-dom";
import { symbols } from "../types";
export function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="pill">A little paper. A whole new world.</span>
          <h1>
            Your sketch.
            <br />
            Your rules.
            <br />
            <em>Your game.</em>
          </h1>
          <p>
            Turn simple shapes into a platform adventure. Upload a drawing,
            review the objects, and bring your level to life.
          </p>
          <div className="actions">
            <Link to="/studio" className="button primary large">
              Create a game <span>→</span>
            </Link>
            <Link to="/studio?sample=trail" className="button large">
              Try sample level ▷
            </Link>
          </div>
          <p className="honest-note">
            <span aria-hidden="true">✦</span> Start with samples or label your
            sketch manually.
            <br />
            Trained handwriting recognition is not available yet.
          </p>
        </div>
        <div
          className="hero-art"
          aria-label="An example platform world drawn from simple shapes"
        >
          <div className="art-top">
            <span>YOUR NEXT ADVENTURE</span>
            <span>● ● ●</span>
          </div>
          <svg
            viewBox="0 0 520 370"
            role="img"
            aria-label="Sample game illustration with platforms, coins, player, spikes and goal"
          >
            <defs>
              <pattern
                id="dots"
                width="24"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="1" fill="#cad5e3" />
              </pattern>
            </defs>
            <rect width="520" height="370" fill="url(#dots)" />
            <path
              d="M30 290 Q160 70 320 180 T490 90"
              fill="none"
              stroke="#aabfe3"
              strokeDasharray="6 8"
              strokeWidth="2"
            />
            <rect
              x="32"
              y="288"
              width="170"
              height="20"
              rx="4"
              fill="#536d91"
            />
            <rect
              x="228"
              y="232"
              width="110"
              height="18"
              rx="4"
              fill="#536d91"
            />
            <rect
              x="375"
              y="166"
              width="115"
              height="18"
              rx="4"
              fill="#536d91"
            />
            <rect x="62" y="256" width="23" height="32" rx="4" fill="#3476f6" />
            <path
              d="M74 240v-28m0 0-5 7m5-7 5 7"
              stroke="#3476f6"
              strokeWidth="2"
            />
            <text x="40" y="199" fill="#3476f6" fontSize="13">
              start here
            </text>
            {[130, 165, 264, 301, 400].map((x, i) => (
              <circle
                key={x}
                cx={x}
                cy={i < 2 ? 254 : i < 4 ? 200 : 132}
                r="9"
                fill="#f4c344"
                stroke="#d29b25"
                strokeWidth="2"
              />
            ))}
            <path d="m320 325 12-24 12 24m5 0 12-24 12 24" fill="#e47570" />
            <path
              d="M462 163V100l-30 5v24l30-5"
              stroke="#8958cc"
              strokeWidth="4"
              fill="#c5a3f0"
            />
            <text x="390" y="85" fill="#8958cc" fontSize="14">
              the finish line
            </text>
          </svg>
          <div className="art-bottom">
            <span className="badge">Sample world</span>
            <span>Draw → Review → Play</span>
          </div>
          <div className="art-sticker">
            Made from
            <br />
            <b>your imagination ✨</b>
          </div>
        </div>
      </section>
      <section className="how-section">
        <div className="section-title">
          <div>
            <div className="eyebrow">FROM PAPER TO PLAY</div>
            <h2>A small idea goes a long way.</h2>
          </div>
          <Link to="/help">See how it works →</Link>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            [
              "01",
              "Draw your world",
              "Use five simple symbols on a sheet of white paper.",
            ],
            [
              "02",
              "Make it yours",
              "Find candidates, fix the boxes, and choose what each object does.",
            ],
            [
              "03",
              "Press play",
              "Try your game, check its path, and save it for later.",
            ],
          ].map(([n, title, text]) => (
            <article className="card how-card" key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="card symbol-section">
        <div>
          <div className="eyebrow">FIVE SHAPES. LOTS OF POSSIBILITIES.</div>
          <h2>Meet your building blocks</h2>
        </div>
        <div className="symbol-row">
          {symbols.map((s) => (
            <div className={`symbol ${s.kind}`} key={s.kind}>
              <span aria-hidden="true">{s.icon}</span>
              <b>{s.name}</b>
              <small>{s.drawing}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="saved-banner">
        <div>
          <h2>Keep your worlds close.</h2>
          <p>Open, edit, and play the levels you have saved.</p>
        </div>
        <Link to="/levels" className="button">
          Go to my levels →
        </Link>
      </section>
    </>
  );
}
