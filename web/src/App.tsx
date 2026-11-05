import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { TxScopeProvider } from './components/Tx';
import { Activity } from './pages/Activity';
import { Borrower } from './pages/Borrower';
import { Buyer } from './pages/Buyer';
import { Capacity } from './pages/Capacity';
import { Issuer } from './pages/Issuer';
import { Lender } from './pages/Lender';
import { NotFound, Privacy, Terms } from './pages/Legal';
import { Overview } from './pages/Overview';
import { Settings } from './pages/Settings';
import { DataProvider } from './state/data';
import { SettingsProvider } from './state/settings';

export function App() {
  return (
    <SettingsProvider>
      <DataProvider>
        <TxScopeProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/issuer" element={<Issuer />} />
              <Route path="/lender" element={<Lender />} />
              <Route path="/buyer" element={<Buyer />} />
              <Route path="/borrower" element={<Borrower />} />
              <Route path="/capacity" element={<Capacity />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </TxScopeProvider>
      </DataProvider>
    </SettingsProvider>
  );
}
