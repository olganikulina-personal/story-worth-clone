import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

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

    return NextResponse.json({ success: true });
}