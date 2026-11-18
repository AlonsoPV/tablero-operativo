-- Administrative read-only diagnostics. Avoid exporting phone numbers or payloads.
select status,stage,error_code,count(*) as jobs,min(created_at) as oldest
from public.whatsapp_inbound_jobs group by status,stage,error_code order by status,stage;

select id,kind,status,stage,attempts,error_code,created_at,updated_at
from public.whatsapp_inbound_jobs order by created_at desc limit 50;

select jobname,schedule,active from cron.job where jobname='whatsapp-inbound-worker';
select jobid,status,start_time,end_time,return_message from cron.job_run_details
where jobid in (select jobid from cron.job where jobname='whatsapp-inbound-worker')
order by start_time desc limit 10;
-- cron success only proves scheduling. Also inspect pg_net HTTP results and Edge logs.
