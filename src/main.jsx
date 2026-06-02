import{StrictMode}from'react';
import{createRoot}from'react-dom/client';
import{HashRouter}from'react-router-dom';
import'./index.css';
import App from'./App.jsx';

// HashRouter uses the URL hash (#) so GitHub Pages always serves index.html —
// no server-side routing config needed. All future routes must use <Route> inside App.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App/>
    </HashRouter>
  </StrictMode>
)
