import { Home, BarChart3, Layers, BookOpen } from "lucide-react";
import "./Sidebar.css";

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">R</div>
        <h2>Recall</h2>
      </div>
      <ul className="sidebar-menu">
        <li 
          className={currentPage === "info" ? "active" : ""} 
          onClick={() => onPageChange("info")}
        >
          <Home size={20} className="icon" />
          Home
        </li>
        <li 
          className={currentPage === "analysis" ? "active" : ""} 
          onClick={() => onPageChange("analysis")}
        >
          <BarChart3 size={20} className="icon" />
          Analysis
        </li>
        <li 
          className={currentPage === "batch" ? "active" : ""} 
          onClick={() => onPageChange("batch")}
        >
          <Layers size={20} className="icon" />
          Batch
        </li>
        <li 
          className={currentPage === "documentation" ? "active" : ""} 
          onClick={() => onPageChange("documentation")}
        >
          <BookOpen size={20} className="icon" />
          Documentation
        </li>
      </ul>
      <div className="sidebar-footer">
        v0.1.0
      </div>
    </nav>
  );
}
