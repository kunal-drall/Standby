import React from 'react';
import deployments from '../../../../packages/shared/src/deployments.json';

const EXPLORER = 'https://explorer.testnet.whitechain.io';
const RPC = 'https://rpc.testnet.whitechain.io';
const FAUCET = 'https://faucet.testnet.whitechain.io';

type Row = {name: string; address: string};

function AddressCell({address}: {address: string}): React.JSX.Element {
  if (!address) return <span className="deploy-missing">Not deployed yet</span>;
  return <code>{address}</code>;
}

function ExplorerCell({address}: {address: string}): React.JSX.Element {
  if (!address) return <span className="deploy-missing">Not deployed yet</span>;
  return (
    <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">
      View on explorer
    </a>
  );
}

export default function DeploymentsTable(): React.JSX.Element {
  const rows: Row[] = Object.entries(deployments.contracts as Record<string, string>).map(
    ([name, address]) => ({name, address}),
  );
  rows.push({name: 'USDT (official test token)', address: deployments.usdt});

  return (
    <>
      <h2>Contracts</h2>
      <table className="deploy-table">
        <thead>
          <tr>
            <th>Contract</th>
            <th>Address</th>
            <th>Explorer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>
                <AddressCell address={r.address} />
              </td>
              <td>
                <ExplorerCell address={r.address} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Chain constants</h2>
      <table>
        <tbody>
          <tr>
            <th>Chain</th>
            <td>Whitechain Sepolia</td>
          </tr>
          <tr>
            <th>Chain ID</th>
            <td>{deployments.chainId}</td>
          </tr>
          <tr>
            <th>Start block</th>
            <td>{deployments.startBlock}</td>
          </tr>
          <tr>
            <th>RPC</th>
            <td>
              <code>{RPC}</code>
            </td>
          </tr>
          <tr>
            <th>Explorer</th>
            <td>
              <a href={EXPLORER}>{EXPLORER}</a>
            </td>
          </tr>
          <tr>
            <th>Faucet (WBT for gas)</th>
            <td>
              <a href={FAUCET}>{FAUCET}</a>
            </td>
          </tr>
          <tr>
            <th>USDT</th>
            <td>
              <code>{deployments.usdt}</code>. Read <code>decimals()</code> at runtime; never assume 6.
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
