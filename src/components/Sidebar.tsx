import { useState } from "react";
import { Home, BarChart3, Layers, BookOpen, Menu, X, Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import "./Sidebar.css";

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const toggleSidebar = () => setIsOpen(!isOpen);

  const handlePageClick = (page: string) => {
    onPageChange(page);
    setIsOpen(false); // Close sidebar on selection (mobile)
  };

  return (
    <>
      <button className="menu-toggle" onClick={toggleSidebar}>
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>
      
      {isOpen && <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />}

      <nav className={`sidebar ${isOpen ? "is-open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">R</div>
          <h2>Recall</h2>
        </div>
        <ul className="sidebar-menu">
          <li 
            className={currentPage === "info" ? "active" : ""} 
            onClick={() => handlePageClick("info")}
          >
            <Home size={20} className="icon" />
            Home
          </li>
          <li 
            className={currentPage === "analysis" ? "active" : ""} 
            onClick={() => handlePageClick("analysis")}
          >
            <BarChart3 size={20} className="icon" />
            Analysis
          </li>
          <li 
            className={currentPage === "batch" ? "active" : ""} 
            onClick={() => handlePageClick("batch")}
          >
            <Layers size={20} className="icon" />
            Batch
          </li>
          <li 
            className={currentPage === "documentation" ? "active" : ""} 
            onClick={() => handlePageClick("documentation")}
          >
            <BookOpen size={20} className="icon" />
            Documentation
          </li>
        </ul>
        <div className="sidebar-footer">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
          >
            {theme === "dark" ? <Sun size={16} className="icon" /> : <Moon size={16} className="icon" />}
            {theme === "dark" ? "Tema claro" : "Tema escuro"}
          </button>
          v1.0.3
        </div>
      </nav>
    </>
  );
}
