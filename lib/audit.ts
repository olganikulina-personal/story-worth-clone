import { supabase } from '@/lib/supabase';

type AuditEventStatus = 'success' | 'error';

type AuditEventInput = {
    event_type: string;
    status: AuditEventStatus;
    route: string;
    job_key?: string;
    question_id?: number;
    token?: string;
    message?: string;
    metadata?: Record<string, unknown>;
};

export async function recordAuditEvent(input: AuditEventInput) {
    const { error } = await supabase
        .from('audit_events')
        .insert([{
            event_type: input.event_type,
            status: input.status,
            route: input.route,
            job_key: input.job_key ?? null,
            question_id: input.question_id ?? null,
            token: input.token ?? null,
            message: input.message ?? null,
            metadata: input.metadata ?? {},
        }]);

    if (error) {
        console.error('[audit] failed to record audit event:', error);
    }
}
