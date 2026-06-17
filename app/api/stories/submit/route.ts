import { saveStoryContent } from '@/lib/storyPersistence';
import { recordAuditEvent } from '@/lib/audit';
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
    const route = '/api/stories/submit';
    const { token, content } = await request.json();

    // 1. Fetch token row
    const { data: tokenData, error: tokenError } = await supabase
        .from('access_tokens')
        .select('question_id, is_used, expires_at')
        .eq('token', token)
        .single();

    if (tokenError || !tokenData) {
        return NextResponse.json({ error: 'Invalid link' }, { status: 403 });
    }

    // 2. Check if a newer token exists (means this story is locked)
    const { count } = await supabase
        .from('access_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('question_id', tokenData.question_id)
        .gt('expires_at', tokenData.expires_at);

    const isLocked = (count ?? 0) > 0;

    if (isLocked) {
        return NextResponse.json({ error: 'This story has been locked.' }, { status: 409 });
    }

    // 3. Also reject expired tokens that have never been used
    if (!tokenData.is_used && new Date(tokenData.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 });
    }

    if (!tokenData.is_used) {
        // 4a. First submit: save story, mark token used, send email
        const { error: storyError } = await saveStoryContent(tokenData.question_id, content);

        if (storyError) {
            await recordAuditEvent({
                event_type: 'story_saved',
                status: 'error',
                route,
                question_id: tokenData.question_id,
                token,
                message: storyError.message ?? 'Failed to save story',
                metadata: { mode: 'first_submit' },
            });
            return NextResponse.json({ error: 'Failed to save story' }, { status: 500 });
        }

        await recordAuditEvent({
            event_type: 'story_saved',
            status: 'success',
            route,
            question_id: tokenData.question_id,
            token,
            metadata: { mode: 'first_submit' },
        });

        const { error: markUsedError } = await supabase
            .from('access_tokens')
            .update({ is_used: true })
            .eq('token', token);

        if (markUsedError) {
            console.error('Failed to mark token as used:', markUsedError);
            return NextResponse.json({ error: 'Failed to mark story as submitted' }, { status: 500 });
        }

        const familyEmails = process.env.FAMILY_EMAILS?.split(',') || [];
        const emailResult = await resend.emails.send({
            from: 'StoryPulse <onboarding@resend.dev>',
            to: familyEmails,
            subject: "✨ Babushka just shared a new story!",
            html: `
                <p>A new memory has been added to the family book:</p>
                <blockquote style="padding: 10px; border-left: 4px solid #ccc;">
                  ${content}
                </blockquote>
                <p>You can see it along with all past stories here:
                   <a href="${process.env.NEXT_PUBLIC_BASE_URL}">View Family Book</a>
                </p>
                <p>Use passcode: <strong>${process.env.FAMILY_PASSCODE}</strong> to unlock.</p>
              `
        });

        if (emailResult?.error) {
            await recordAuditEvent({
                event_type: 'submit_email_sent',
                status: 'error',
                route,
                question_id: tokenData.question_id,
                token,
                message: emailResult.error.message,
            });
            return NextResponse.json({ error: 'Failed to send notification email' }, { status: 500 });
        }

        await recordAuditEvent({
            event_type: 'submit_email_sent',
            status: 'success',
            route,
            question_id: tokenData.question_id,
            token,
        });
    } else {
        // 4b. Edit: save updated story content, no email
        const { error: updateError } = await saveStoryContent(tokenData.question_id, content);

        if (updateError) {
            await recordAuditEvent({
                event_type: 'story_saved',
                status: 'error',
                route,
                question_id: tokenData.question_id,
                token,
                message: updateError.message ?? 'Failed to update story',
                metadata: { mode: 'edit' },
            });
            return NextResponse.json({ error: 'Failed to update story' }, { status: 500 });
        }

        await recordAuditEvent({
            event_type: 'story_saved',
            status: 'success',
            route,
            question_id: tokenData.question_id,
            token,
            metadata: { mode: 'edit' },
        });
    }

    return NextResponse.json({ success: true });
}
