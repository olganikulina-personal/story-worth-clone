import { supabase } from '@/lib/supabase';
import { recordAuditEvent } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: Request) {
    const route = '/api/cron/send-prompt';
    const jobKey = `weekly_prompt:${new Date().toISOString().slice(0, 10)}`;
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        await recordAuditEvent({
            event_type: 'cron_started',
            status: 'success',
            route,
            job_key: jobKey,
        });

        // 1. Fetch next question
        const { data: question, error: qError } = await supabase
            .from('questions')
            .select('id, prompt')
            .eq('is_sent', false)
            .order('order_index', { ascending: true })
            .limit(1)
            .single();

        if (qError) {
            await recordAuditEvent({
                event_type: 'question_lookup',
                status: 'error',
                route,
                job_key: jobKey,
                message: qError.message,
            });
            return NextResponse.json({ error: 'Failed' }, { status: 500 });
        }

        if (!question) {
            await recordAuditEvent({
                event_type: 'question_lookup',
                status: 'success',
                route,
                job_key: jobKey,
                message: 'No unsent questions remaining',
            });
            return NextResponse.json({ message: 'Done!' });
        }

        // 2. Create the token
        const { data: tokenData, error: tError } = await supabase
            .from('access_tokens')
            .insert([{ question_id: question.id }])
            .select()
            .single();

        if (tError) {
            await recordAuditEvent({
                event_type: 'token_created',
                status: 'error',
                route,
                job_key: jobKey,
                question_id: question.id,
                message: tError.message,
            });
            throw tError;
        }

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const magicLink = `${baseUrl}/write/${tokenData.token}`;
        const familyEmails = process.env.FAMILY_EMAILS?.split(',') || [];

        // 3. Send the email to YOU
        const emailResult = await resend.emails.send({
            from: 'StoryPulse <onboarding@resend.dev>', // Resend's default test sender
            to: familyEmails, // YOUR email address
            subject: "Weekly Prompt for Babushka: " + question.prompt,
            html: `
        <p>It's time for a new story!</p>
        <p><strong>Prompt:</strong> ${question.prompt}</p>
        <p><a href="${magicLink}">${magicLink}</a></p>
      `
        });

        if (emailResult?.error) {
            await recordAuditEvent({
                event_type: 'prompt_email_sent',
                status: 'error',
                route,
                job_key: jobKey,
                question_id: question.id,
                token: tokenData.token,
                message: emailResult.error.message,
            });
            throw new Error(emailResult.error.message);
        }

        await recordAuditEvent({
            event_type: 'prompt_email_sent',
            status: 'success',
            route,
            job_key: jobKey,
            question_id: question.id,
            token: tokenData.token,
        });

        // 4. Mark as sent
        const { error: markSentError } = await supabase
            .from('questions')
            .update({ is_sent: true })
            .eq('id', question.id);

        if (markSentError) {
            await recordAuditEvent({
                event_type: 'question_marked_sent',
                status: 'error',
                route,
                job_key: jobKey,
                question_id: question.id,
                message: markSentError.message,
            });
            throw markSentError;
        }

        await recordAuditEvent({
            event_type: 'question_marked_sent',
            status: 'success',
            route,
            job_key: jobKey,
            question_id: question.id,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[cron] failed to send prompt:', err);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
