import { BarChart3, Layers, BookOpen } from "lucide-react";

interface InfoPageProps {
  onPageChange: (page: string) => void;
}

export function InfoPage({ onPageChange }: InfoPageProps) {
  return (
    <div className="info-page">
      <h1>Welcome to Recall</h1>
      <p className="subtitle">High-performance analysis tool for RCL files.</p>
      
      <div className="nav-grid">
        <div className="nav-card analysis" onClick={() => onPageChange("analysis")}>
          <div className="nav-icon">
            <BarChart3 size={40} />
          </div>
          <div className="nav-info">
            <h3>Single Analysis</h3>
            <p>Analyze a single RCL contract by uploading a file or pasting text.</p>
          </div>
          <div className="nav-arrow">→</div>
        </div>

        <div className="nav-card batch" onClick={() => onPageChange("batch")}>
          <div className="nav-icon">
            <Layers size={40} />
          </div>
          <div className="nav-info">
            <h3>Batch Analysis</h3>
            <p>Select a folder to process multiple RCL files and export CSV results.</p>
          </div>
          <div className="nav-arrow">→</div>
        </div>

        <div className="nav-card documentation" onClick={() => onPageChange("documentation")}>
          <div className="nav-icon">
            <BookOpen size={40} />
          </div>
          <div className="nav-info">
            <h3>Documentation</h3>
            <p>Learn more about RCL and how to use Recall effectively.</p>
          </div>
          <div className="nav-arrow">→</div>
        </div>
      </div>

      {/* <section className="getting-started">
        <h2>Getting Started</h2>
        <ol>
          <li>Go to the <strong>Analysis</strong> tab in the sidebar.</li>
          <li>Choose your preferred logging mode (Default, Verbose, or Test).</li>
          <li>Click <strong>Select and Process File</strong> to begin.</li>
        </ol>
      </section> */}

      <style>{`
        .info-page {
          max-width: 800px;
          margin: 0 auto;
          text-align: center;
          padding: 2rem;
          color: #f6f6f6;
        }
        .subtitle {
          font-size: 1.2rem;
          color: #646cff;
          margin-bottom: 3rem;
        }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 2rem;
          margin-bottom: 4rem;
        }
        .info-card {
          background: rgba(255, 255, 255, 0.05);
          padding: 1.5rem;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: transform 0.3s ease;
        }
        .info-card:hover {
          transform: translateY(-5px);
          background: rgba(255, 255, 255, 0.08);
        }
        .info-card h3 {
          margin-top: 0;
          color: #24c8db;
        }
        .nav-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
          margin-bottom: 3rem;
        }
        .nav-card {
          display: flex;
          align-items: center;
          background: linear-gradient(135deg, rgba(100, 108, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 100%);
          padding: 2rem;
          border-radius: 16px;
          border: 1px solid rgba(100, 108, 255, 0.3);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          text-align: left;
          position: relative;
          overflow: hidden;
        }
        .nav-card:hover {
          transform: translateY(-8px);
          background: linear-gradient(135deg, rgba(100, 108, 255, 0.25) 0%, rgba(255, 255, 255, 0.08) 100%);
          border-color: rgba(100, 108, 255, 0.6);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
        }
        .nav-icon {
          background: rgba(100, 108, 255, 0.2);
          padding: 1rem;
          border-radius: 12px;
          margin-right: 1.5rem;
          color: #646cff;
        }
        .nav-info h3 {
          margin: 0 0 0.5rem 0;
          color: #fff;
          font-size: 1.3rem;
        }
        .nav-info p {
          margin: 0;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.95rem;
          line-height: 1.4;
        }
        .nav-arrow {
          margin-left: auto;
          font-size: 1.5rem;
          color: rgba(100, 108, 255, 0.4);
          transition: transform 0.3s ease;
        }
        .nav-card:hover .nav-arrow {
          transform: translateX(5px);
          color: #646cff;
        }
        .getting-started {
          text-align: left;
          background: rgba(100, 108, 255, 0.1);
          padding: 2rem;
          border-radius: 12px;
          border: 1px solid rgba(100, 108, 255, 0.2);
        }
        .getting-started h2 {
          margin-top: 0;
        }
        .getting-started ol {
          line-height: 1.8;
        }
      `}</style>
    </div>
  );
}
