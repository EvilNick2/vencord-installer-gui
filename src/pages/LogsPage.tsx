import type { ReactElement } from "react";

type LogEntry = {
  time: string;
  label: string;
  message: string;
};

type LogPanel = {
  id: string;
  title: string;
  status: 'pending' | 'ready' | 'info';
  statusText: string;
  description: string;
  nextSteps: string;
  entries: LogEntry[];
};

export default function LogsPage(): ReactElement {
  const panels: LogPanel[] = [
    {
      id: 'backup',
      title: 'Backup current Vencord install',
      status: 'pending',
      statusText: 'Awaiting wiring',
      description:
        'Prepare to capture the existing Vencord files before applying changes so we can roll back.',
      nextSteps: 'Connect the backup command to stream output here.',
      entries: [
        {
          time: '12:30:02',
          label: 'plan',
          message: 'Queued backup flow; waiting for backend hook.',
        },
        {
          time: '12:29:55',
          label: 'hint',
          message: 'Will archive the current Vencord directory before patching.',
        },
      ],
    },
    {
      id: 'clone',
      title: 'Clone upstream repo',
      status: 'pending',
      statusText: 'Planned',
      description:
        'Logs for fetching the official Vencord repository so installs can use the freshest code.',
      nextSteps: 'Surface git output once the upstream clone command lands.',
      entries: [
        {
          time: '12:31:18',
          label: 'plan',
          message: 'Scheduled to run git clone or git pull during setup.',
        },
        {
          time: '12:31:08',
          label: 'note',
          message: 'Add streaming so progress and failures appear here.',
        },
      ],
    },
    {
      id: 'installer',
      title: 'Installer session',
      status: 'ready',
      statusText: 'UI ready',
      description:
        'General logs for installer actions, health checks, and user-visible events.',
      nextSteps: 'Wire Tauri log events to this feed.',
      entries: [
        {
          time: '12:32:10',
          label: 'info',
          message: 'Log UI ready to receive events.',
        },
        {
          time: '12:32:01',
          label: 'ui',
          message: 'Added separate panels for backup and repo sync.',
        },
        {
          time: '12:31:52',
          label: 'todo',
          message: 'Hook into backend streams for real-time output.',
        },
      ],
    },
  ];

  return (
    <section className='logs-section'>
      <header className='logs-header'>
        <div>
          <h2>Logs</h2>
          <p>
            A dedicated space for streaming installer output. Use this page to monitor backup,
            clone, and runtime tasks once the backend hooks are connected.
          </p>
        </div>
      </header>

      <div className='log-grid'>
        {panels.map((panel) => (
          <article key={panel.id} className='card log-card'>
            <header className='log-card__header'>
              <div>
                <h3>{panel.title}</h3>
                <p className='log-card__description'>{panel.description}</p>
              </div>
              <span className={`status-pill status-${panel.status}`}>
                {panel.statusText}
              </span>
            </header>

            <div className='log-card__meta'>
              <div>
                <small>Next step</small>
                <div className='log-card__next'>{panel.nextSteps}</div>
              </div>
              <div>
                <small>Entries</small>
                <div className='log-card__count'>{panel.entries.length}</div>
              </div>
            </div>

            <div className='logs-box log-scroll'>
              <ul className='log-list'>
                {panel.entries.map((entry, idx) => (
                  <li key={`${panel.id}-${idx}`} className='log-entry'>
                    <span className='log-time'>{entry.time}</span>
                    <span className='log-label'>{entry.label}</span>
                    <span className='log-message'>{entry.message}</span>
                  </li>
                ))}
                {panel.entries.length === 0 && (
                  <li className='log-entry log-entry--muted'>Waiting for events...</li>
                )}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}