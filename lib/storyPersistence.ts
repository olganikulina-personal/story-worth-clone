import { supabase } from '@/lib/supabase';

type StoryPersistenceError = {
    code?: string | null;
    message?: string | null;
};

function isLegacyStoriesSchemaError(error: StoryPersistenceError | null | undefined) {
    if (!error) return false;

    return error.code === '42P10'
        || error.code === '42703'
        || error.message?.includes('ON CONFLICT') === true
        || error.message?.includes('updated_at') === true;
}

export async function saveStoryContent(questionId: number, content: string) {
    const updatedAt = new Date().toISOString();

    const { error: upsertError } = await supabase
        .from('stories')
        .upsert([{ question_id: questionId, content, updated_at: updatedAt }], { onConflict: 'question_id' });

    if (!upsertError) {
        return { error: null };
    }

    if (!isLegacyStoriesSchemaError(upsertError)) {
        return { error: upsertError };
    }

    const { data: existingStories, error: existingError } = await supabase
        .from('stories')
        .select('id')
        .eq('question_id', questionId)
        .limit(1);

    if (existingError) {
        return { error: existingError };
    }

    if (existingStories && existingStories.length > 0) {
        const { error: updateError } = await supabase
            .from('stories')
            .update({ content })
            .eq('question_id', questionId);

        return { error: updateError };
    }

    const { error: insertError } = await supabase
        .from('stories')
        .insert([{ question_id: questionId, content }]);

    return { error: insertError };
}
