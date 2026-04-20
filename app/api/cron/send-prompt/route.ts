import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        // 1. Fetch next question
        const { data: question, error: qError } = await supabase
            .from('questions')
            .select('id, prompt')
            .eq('is_sent', false)
            .order('order_index', { ascending: true })
            .limit(1)
            .single();

        if (qError || !question) return NextResponse.json({ message: 'Done!' });

        // 2. Create the token
        const { data: tokenData, error: tError } = await supabase
            .from('access_tokens')
            .insert([{ question_id: question.id }])
            .select()
            .single();

        if (tError) throw tError;

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const magicLink = `${baseUrl}/write/${tokenData.token}`;

        // 3. Send the email to YOU
        await resend.emails.send({
            from: 'StoryPulse <onboarding@resend.dev>', // Resend's default test sender
            to: 'olganikulina88@gmail.com', // YOUR email address
            subject: "Weekly Prompt for Grandma: " + question.prompt,
            html: `
        <p>It's time for a new story!</p>
        <p><strong>Prompt:</strong> ${question.prompt}</p>
        <p><a href="${magicLink}">${magicLink}</a></p>
      `
        });

        // 4. Mark as sent
        await supabase.from('questions').update({ is_sent: true }).eq('id', question.id);

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}