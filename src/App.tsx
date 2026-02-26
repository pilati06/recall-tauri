import { useState } from "react";
import "./App.css";

// Components
import { Sidebar } from "./components/Sidebar";
import { InfoPage } from "./pages/InfoPage";
import { BatchAnalysisPage } from "./pages/BatchAnalysisPage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { DocumentationPage } from "./pages/DocumentationPage";

function App() {
  const [currentPage, setCurrentPage] = useState("info");

  return (
    <div className="app-container">
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      
      <main className="main-content">
        {currentPage === "info" ? (
          <InfoPage onPageChange={setCurrentPage} />
        ) : currentPage === "batch" ? (
          <BatchAnalysisPage />
        ) : currentPage === "documentation" ? (
          <DocumentationPage />
        ) : (
          <AnalysisPage />
        )}
      </main>
    </div>
  );
}

export default App;
