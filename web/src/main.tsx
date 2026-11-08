import '@fontsource/bagel-fat-one/latin-400.css';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import './theme/tokens.css';
import './theme/base.css';
import './theme/pot.css';
import './theme/sheets.css';
import './theme/climax.css';
import './theme/pages.css';
import { createRoot } from 'react-dom/client';
import { AccountStore } from './chain/account';
import { ChainStore } from './chain/store';
import type { InstancesFile } from './chain/types';
import { App } from './components/App';
import { Ctx } from './hooks/context';
import { loadArt } from './theme/art';

async function boot() {
  const instances = (await (await fetch('./instances.json')).json()) as InstancesFile;
  const asked = new URLSearchParams(location.search).get('i') ?? instances.default;
  const instanceKey = instances.instances[asked] ? asked : instances.default;
  const info = instances.instances[instanceKey];
  const chain = new ChainStore(info.contractId, `./snapshots/${instanceKey}.json`);
  const account = new AccountStore(info.contractId, (id) => chain.setAccount(id));
  await loadArt();
  createRoot(document.getElementById('root')!).render(
    <Ctx.Provider value={{ instanceKey, info, instances, chain, account }}>
      <App />
    </Ctx.Provider>,
  );
  chain.start();
}

void boot();
