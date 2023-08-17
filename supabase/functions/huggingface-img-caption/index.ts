// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { HfInference } from "https://esm.sh/@huggingface/inference@2.2.0"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { Database } from "./types.ts"

console.log("Hello from `huggingface-img-caption` function!")

const hf = new HfInference();

type SoRecord = Database['storage']['Tables']['objects']['Row']
interface WebhookPayload {
  type: "INSERT";
  table: string;
  record: SoRecord;
  schema: "public";
  old_record: null | SoRecord;
}

serve(async (req) => {
  const payload: WebhookPayload = await req.json()
  const soRecord = payload.record
  const supabaseAdminClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // construct img url from storage
  const { data, error } = await supabaseAdminClient.storage.from(soRecord.bucket_id!).createSignedUrl(soRecord.path_tokens!.join('/'), 60);
  if (error) throw error;

  const { signedUrl } = data;

  console.log('signedUrl=', signedUrl)

  // run image captioning with HuggingFace
  const imgDesc: { generated_text: string} = await hf.imageToText({
    data: await(await fetch(signedUrl)).blob(),
    model: 'nlpconnect/vit-gpt2-image-captioning',
  })

  console.log('imgDesc=', imgDesc)

  // store img caption in db table
  await supabaseAdminClient.from('image-caption').insert({id: soRecord.id!, caption: imgDesc.generated_text}).throwOnError();

  return new Response('ok')
})

// To invoke:
// curl -i --location --request POST 'http://localhost:54321/functions/v1/' \
//   --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
//   --header 'Content-Type: application/json' \
//   --data '{"name":"Functions"}'
