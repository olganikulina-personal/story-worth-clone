import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
    const { token, content } = await request.json();

    // 1. Verify token is still valid and not used
    const { data: tokenData, error: tokenError } = await supabase
        .from('access_tokens')
        .select('question_id, is_used, expires_at')
        .eq('token', token)
        .single();

    if (tokenError || !tokenData || tokenData.is_used || new Date(tokenData.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 });
    }

    // 2. Insert the story
    const { error: storyError } = await supabase
        .from('stories')
        .insert([{ question_id: tokenData.question_id, content }]);

    if (storyError) return NextResponse.json({ error: 'Failed to save story' }, { status: 500 });

    // 3. Mark token as used so it can't be submitted again
    await supabase
        .from('access_tokens')
        .update({ is_used: true })
        .eq('token', token);

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

    return NextResponse.json({ success: true });
}