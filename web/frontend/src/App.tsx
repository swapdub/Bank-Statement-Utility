import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import UploadPage from "@/pages/UploadPage";
import TransactionsPage from "@/pages/TransactionsPage";
import CategorizePage from "@/pages/CategorizePage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import { ThemeProvider } from "@/lib/theme";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<UploadPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/categorize" element={<CategorizePage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
