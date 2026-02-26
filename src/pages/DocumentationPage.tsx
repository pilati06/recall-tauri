import { Code, FileText, Info } from "lucide-react";

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
        <h2><Code size={24} className="doc-icon" /> Relationship Constraint Language (RCL)</h2>
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
          color: #f6f6f6;
          text-align: left;
        }
        .subtitle {
          font-size: 1.2rem;
          color: #646cff;
          margin-bottom: 3rem;
          text-align: center;
        }
        .doc-section {
          background: rgba(255, 255, 255, 0.03);
          padding: 2rem;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
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
          background: #1a1a1a;
          padding: 1.5rem;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          font-family: 'Fira Code', monospace;
          color: #dcdcaa;
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
          color: #fff;
        }
        .documentation-page ul {
          line-height: 1.8;
          color: rgba(255, 255, 255, 0.8);
        }
        .documentation-page strong {
          color: #fff;
        }
      `}</style>
    </div>
  );
}
