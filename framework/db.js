// Read-only database checks, using node-oracledb in "thin" mode (no Oracle client or
// sqlplus needed on the PC). Schema names come from settings.json.
const oracledb = require('oracledb');
const { settings } = require('./config');
const creds = require('./credentials');

let conn;
const S = () => settings.database;

async function query(sql, binds = {}) {
  if (!S() || !S().enabled) throw new Error('database checks are switched off in settings.json');
  conn ||= await oracledb.getConnection({ user: S().user, password: creds.db(), connectString: S().connectString });
  const r = await conn.execute(sql, binds);
  return r.rows.map(row => row.map(v => (v == null ? '' : String(v))));
}

const WF = () => S().workflowSchema || 'EXIMWF';
const SYS = () => S().systemSchema || 'EXIMSYS';
const TRX = () => S().transactionSchema || 'EXIMTRX';

module.exports = {
  query,
  enabled: () => !!(S() && S().enabled),
  close: async () => { if (conn) await conn.close().catch(() => {}); conn = null; },

  // Open workflow tasks: [task id, task name, task type, assignee]
  tasks: ref => query(`select c_task_id, c_task_name, c_task_type, nvl(c_assignee,'-') from ${WF()}.wf_act_task
                       where c_main_ref = :ref order by t_create_time`, { ref }),

  // Status of the txn in <MODULE>_MASTER (M = mastered)
  master: async (module, ref) => {
    const [r] = await query(`select c_trx_status, c_unit_code, c_event_name from ${TRX()}.${module}_master where c_main_ref = :ref`, { ref });
    return r ? { status: r[0], unit: r[1], event: r[2] } : null;
  },

  // Open system/workflow exceptions (the Exception queue)
  exceptions: async ref => (await query(`select c_exception_type || ': ' || substr(c_failure_reason, 1, 120) from ${SYS()}.wf_act_exception
                                          where c_main_ref = :ref`, { ref })).map(r => r[0]),

  // GAPI calls: [map name, sent flag, response flag]
  gapi: ref => query(`select c_gapi_map_name, nvl(msg_sent,'-'), nvl(msg_resp,'-') from ${SYS()}.trx_etfs_gapi
                      where c_main_ref = :ref order by i_event_times, seq`, { ref }),

  // FIRCO screening rows: [status, status code, send condition]
  firco: ref => query(`select nvl(status,'-'), nvl(status_code,'-'), nvl(c_send_condition,'-') from ${SYS()}.trx_etfs_firco_dtal
                       where c_main_ref = :ref`, { ref }),
};
