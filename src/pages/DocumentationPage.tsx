import { Code, FileText, Info, BookOpen } from "lucide-react";
import { GRAMMAR_SYMBOLS } from "../data/grammarSymbols";

export function DocumentationPage() {
  return (
    <div className="documentation-page">
      <h1 style={{textAlign: "center"}}>Documentation</h1>
      <p className="subtitle">Learn how to use Recall and write RCL contracts.</p>

      <div className="doc-section">
        <h2><Info size={24} className="doc-icon" /> Introduction to RECALL Tool</h2>
        <p>
          Nowadays, contracts has an important role in business where trade relationships between different parties are dictated by legal rules. The concept of electronic contracts has arisen mostly due to technological advances and most frequent practice of electronic trading between companies and customers. Therewith new challenges have emerged to guarantee reliability between the stakeholders in the electronic negotiations. The automatic verification of electronic contracts has arisen as a new challenge especially in the task of detecting conflicts in multi-party contracts. The problem of checking contracts has been largely addressed in the literature, but only few works have dealt with multi-party contracts. The RECALL tool is an automatic checker for finding conflicts on multi-party contracts modeled by the relativized contract language. The modeling and automatic checking of the contract allow us to ascertain important results on its business model.
        </p>
      </div>

      <div className="doc-section">
        <h2><Code size={24} className="doc-icon" /> Relativization Constraint Language (RCL)</h2>
        <p>
          In addition, here are some examples of contracts written in RCL to facilitate the understanding of the language.
        </p>
        <pre className="code-block">
{`/*************************************************************************
Morpheus offers to Neo two choices: Neo must choose between red or blue
pill. His choice have implications that will make him wake up and he
can save the World or will simply make him wake up in his bed and
not remembering nothing.
If Neo fails to change the World, Smith will destroy the Matrix.
**************************************************************************/
conflict{
   global{(showTrue,hideTrue), (redPill,bluePill)};
};

{neo,morpheus}[redPill](
   {morpheus,neo}O(showTrue)^
   {morpheus,neo}[showTrue](
      {neo}O(saveWorld)_/
         {smith}O(destroyMatrix)
      /_ 
   )
);
{neo,morpheus}[bluePill](
   {morpheus,neo}O(hideTrue&forget)^
   {morpheus,neo}[hideTrue](
      [1*]({neo}O(liveInIgnorance)) ^
      {smith}O(destroyMatrix)
   )
);`}
        </pre>
      </div>

      <div className="doc-section">
        <h2><FileText size={24} className="doc-icon" /> How to use the Analysis Tool</h2>
        <div className="step-card">
          <h3>Single Analysis</h3>
          <p>
            Go to the <strong>Analysis</strong> tab. You can either select an `.rcl` file from your computer 
            or paste the contract text directly into the editor. Choose a mode (Default, Verbose, or Test) 
            to control the detail level of the output and logs.
          </p>
        </div>
        <div className="step-card">
          <h3>Batch Analysis</h3>
          <p>
            The <strong>Batch</strong> tab allows you to select a directory containing multiple `.rcl` files. 
            Recall will process all files in parallel and generate a comprehensive `batch_results.csv` 
            summary in the same folder.
          </p>
        </div>
      </div>

      <div className="doc-section">
        <h2><BookOpen size={24} className="doc-icon" /> RCL Grammar &amp; Symbols Reference</h2>
        <p>
          This is the full list of symbols and keywords defined by the RCL grammar, grouped by purpose.
          The same reference is available directly in the editor: open the <strong>Analysis</strong> tab
          and click the book icon next to the contract editor to insert any of these symbols at the cursor.
        </p>
        {GRAMMAR_SYMBOLS.map((group) => (
          <div className="grammar-group" key={group.category}>
            <h3>{group.category}</h3>
            <div className="grammar-list">
              {group.items.map((item) => (
                <div className="grammar-item" key={item.name}>
                  <code className="grammar-code">{item.symbol}</code>
                  <div className="grammar-item-text">
                    <span className="grammar-item-name">{item.name}</span>
                    <p className="grammar-item-desc">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* <div className="doc-section">
        <h2><BookOpen size={24} className="doc-icon" /> Advanced Features</h2>
        <ul>
          <li><strong>Memory Guard:</strong> Monitors RAM usage to prevent system crashes during complex analyses.</li>
          <li><strong>Real-time Logs:</strong> Provides immediate feedback on the internal steps of the analyzer.</li>
          <li><strong>CSV Export:</strong> Detailed metrics for performance evaluation and reporting.</li>
        </ul>
      </div> */}

      <style>{`
        .documentation-page {
          max-width: 900px;
          margin: 0 auto;
          padding: 2rem;
          color: var(--text-primary);
          text-align: left;
        }
        .subtitle {
          font-size: 1.2rem;
          color: #646cff;
          margin-bottom: 3rem;
          text-align: center;
        }
        .doc-section {
          background: rgba(var(--ink-rgb), 0.03);
          padding: 2rem;
          border-radius: 16px;
          border: 1px solid rgba(var(--ink-rgb), 0.05);
          margin-bottom: 2rem;
        }
        .doc-section h2 {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #24c8db;
          margin-top: 0;
          margin-bottom: 1.5rem;
        }
        .doc-icon {
          color: #646cff;
        }
        .code-block {
          background: var(--bg-elevated);
          padding: 1.5rem;
          border-radius: 12px;
          border: 1px solid rgba(var(--ink-rgb), 0.1);
          font-family: 'Fira Code', monospace;
          color: var(--code-text);
          margin: 1.5rem 0;
          overflow-x: auto;
        }
        .step-card {
          background: rgba(100, 108, 255, 0.1);
          padding: 1.5rem;
          border-radius: 12px;
          border-left: 4px solid #646cff;
          margin-bottom: 1rem;
        }
        .step-card h3 {
          margin-top: 0;
          color: var(--text-primary);
        }
        .grammar-group {
          margin-bottom: 1.75rem;
        }
        .grammar-group:last-child {
          margin-bottom: 0;
        }
        .grammar-group h3 {
          margin: 0 0 0.75rem 0;
          font-size: 0.95rem;
          color: #a855f7;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .grammar-list {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .grammar-item {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 0.85rem 1rem;
          border-radius: 10px;
          background: rgba(var(--ink-rgb), 0.03);
          border: 1px solid rgba(var(--ink-rgb), 0.05);
        }
        .grammar-code {
          font-family: 'Fira Code', 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          font-weight: 700;
          color: #a855f7;
          background: rgba(168, 85, 247, 0.1);
          padding: 0.3rem 0.6rem;
          border-radius: 6px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .grammar-item-text {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .grammar-item-name {
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--text-primary);
        }
        .grammar-item-desc {
          margin: 0;
          font-size: 0.82rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }
        .documentation-page ul {
          line-height: 1.8;
          color: rgba(var(--ink-rgb), 0.8);
        }
        .documentation-page strong {
          color: var(--text-primary);
        }
        @media (max-width: 768px) {
          .documentation-page {
            padding: 1rem;
          }
          .doc-section {
            padding: 1.2rem;
          }
          .subtitle {
            font-size: 1rem;
            margin-bottom: 2rem;
          }
          h1 {
            font-size: 1.8rem;
          }
          .doc-section h2 {
            font-size: 1.2rem;
            gap: 8px;
          }
          .code-block {
            padding: 1rem;
            font-size: 0.8rem;
          }
          .grammar-item {
            flex-direction: column;
            gap: 0.5rem;
          }
        }
      `}</style>


    </div>
  );
}
