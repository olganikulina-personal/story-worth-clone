import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
    const { token, content } = await request.json();

    // 1. Fetch token row
    const { data: tokenData, error: tokenError } = await supabase
        .from('access_tokens')
        .select('question_id, is_used, expires_at, created_at')
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
        .gt('created_at', tokenData.created_at);

    const isLocked = (count ?? 0) > 0;

    if (isLocked) {
        return NextResponse.json({ error: 'This story has been locked.' }, { status: 409 });
    }

    // 3. Also reject expired tokens that have never been used
    if (!tokenData.is_used && new Date(tokenData.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 });
    }

    if (!tokenData.is_used) {
        // 4a. First submit: insert story, mark token used, send email
        const { error: storyError } = await supabase
            .from('stories')
            .insert([{ question_id: tokenData.question_id, content }]);

        if (storyError) return NextResponse.json({ error: 'Failed to save story' }, { status: 500 });

        const { error: markUsedError } = await supabase
            .from('access_tokens')
            .update({ is_used: true })
            .eq('token', token);

        if (markUsedError) {
            console.error('Failed to mark token as used:', markUsedError);
            // Story was inserted; proceed — the insert succeeded.
            // Caller will still receive success; duplicate-submit risk is low.
        }

        const familyEmails = process.env.FAMILY_EMAILS?.split(',') || [];
        await resend.emails.send({
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
    } else {
        // 4b. Edit: update existing story content, no email
        const { error: updateError } = await supabase
            .from('stories')
            .update({ content })
            .eq('question_id', tokenData.question_id);

        if (updateError) return NextResponse.json({ error: 'Failed to update story' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
