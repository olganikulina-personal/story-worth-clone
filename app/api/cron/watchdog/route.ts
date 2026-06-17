import { recordAuditEvent } from '@/lib/audit';
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const WEEKLY_CRON_ROUTE = '/api/cron/send-prompt';
const WATCHDOG_ROUTE = '/api/cron/watchdog';
const HEALTHY_NO_QUESTIONS_MESSAGE = 'No unsent questions remaining';

function getIsoDaysAgo(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function hasHealthyWeeklyCompletion(events: Array<{ event_type: string; status: string; message: string | null }>) {
    return events.some((event) => {
        if (event.status !== 'success') return false;

        return event.event_type === 'question_marked_sent'
            || (event.event_type === 'question_lookup' && event.message === HEALTHY_NO_QUESTIONS_MESSAGE);
    });
}

function getAlertRecipient() {
    if (process.env.ADMIN_ALERT_EMAIL?.trim()) {
        return process.env.ADMIN_ALERT_EMAIL.trim();
    }

    const familyEmails = process.env.FAMILY_EMAILS?.split(',').map((email) => email.trim()).filter(Boolean) ?? [];
    return familyEmails[0] ?? null;
}

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    const healthyCutoff = getIsoDaysAgo(8);
    const recentAlertCutoff = getIsoDaysAgo(7);

    const { data: recentCronEvents, error: recentCronEventsError } = await supabase
        .from('audit_events')
        .select('event_type, status, route, message')
        .eq('route', WEEKLY_CRON_ROUTE)
        .gte('created_at', healthyCutoff)
        .order('created_at', { ascending: false });

    if (recentCronEventsError) {
        await recordAuditEvent({
            event_type: 'watchdog_check',
            status: 'error',
            route: WATCHDOG_ROUTE,
            message: recentCronEventsError.message,
            metadata: { stage: 'recent_cron_events_lookup' },
        });
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }

    if (hasHealthyWeeklyCompletion(recentCronEvents ?? [])) {
        return NextResponse.json({ success: true, healthy: true });
    }

    const { data: recentAlerts, error: recentAlertsError } = await supabase
        .from('audit_events')
        .select('event_type, status, route, message')
        .eq('route', WATCHDOG_ROUTE)
        .eq('event_type', 'watchdog_alert_sent')
        .eq('status', 'success')
        .gte('created_at', recentAlertCutoff)
        .order('created_at', { ascending: false })
        .limit(1);

    if (recentAlertsError) {
        await recordAuditEvent({
            event_type: 'watchdog_check',
            status: 'error',
            route: WATCHDOG_ROUTE,
            message: recentAlertsError.message,
            metadata: { stage: 'recent_alerts_lookup' },
        });
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }

    if ((recentAlerts?.length ?? 0) > 0) {
        return NextResponse.json({ success: true, healthy: false, alerted: false });
    }

    const alertRecipient = getAlertRecipient();
    if (!alertRecipient) {
        await recordAuditEvent({
            event_type: 'watchdog_alert_sent',
            status: 'error',
            route: WATCHDOG_ROUTE,
            message: 'No admin alert recipient configured',
        });
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }

    const emailResult = await resend.emails.send({
        from: 'StoryPulse <onboarding@resend.dev>',
        to: alertRecipient,
        subject: 'StoryPulse watchdog alert: weekly prompt may have failed',
        html: `
          <p>The daily watchdog did not find a successful weekly prompt completion in the last 8 days.</p>
          <p>Checked route: <strong>${WEEKLY_CRON_ROUTE}</strong></p>
          <p>Checked after: <strong>${healthyCutoff}</strong></p>
          <p>Recommended next step: inspect the Vercel cron logs and the <code>audit_events</code> table.</p>
        `,
    });

    if (emailResult?.error) {
        await recordAuditEvent({
            event_type: 'watchdog_alert_sent',
            status: 'error',
            route: WATCHDOG_ROUTE,
            message: emailResult.error.message,
            metadata: { checked_after: healthyCutoff },
        });
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }

    await recordAuditEvent({
        event_type: 'watchdog_alert_sent',
        status: 'success',
        route: WATCHDOG_ROUTE,
        metadata: { checked_after: healthyCutoff },
    });

    return NextResponse.json({ success: true, healthy: false, alerted: true });
}
