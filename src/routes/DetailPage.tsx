import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useScanQr } from "@/hooks/mutations/useScanQr";

import AnswerInput from "@/components/AnswerInput";
const DetailPage = () => {
  const [searchParams] = useSearchParams();
  const [answer, setAnswer] = useState("");


  const code = searchParams.get("code");

  const dummyData = {
    answers:[],
    bonus: 0,
    clue:"_ _ _ _ _ _ _ _",
    encoded_answer: "******** ******",
    created_at:"2026-08-05T12:31:07.794331Z",
    data: "which company first developed cell phone",
    effects: "UNLOCKED",
    id:3,
    score:10,
  }

  const qrScanMutation = useScanQr();

  useEffect(() => {
    if (!code) {
      return;
    }

    qrScanMutation.mutate(code);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  console.log("QR Code:", code);
  console.log("data:", qrScanMutation.data?.data);

//   if (!code) {
//     return <p className="retro text-center text-xs text-muted-foreground">Invalid QR code.</p>;
//   }

//   if (qrScanMutation.isPending) {
//     return <p className="retro text-center text-xs text-muted-foreground" >Loading...</p>;
//   }

//   if (qrScanMutation.isError) {
//     return <p className="retro text-center text-xs text-muted-foreground">Failed to load question details.</p>;
//   }

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-8 px-4 pt-8">
      {/* {qrScanMutation.data && ( */}
        <p className="retro text-center text-xs text-muted-foreground capitalize" >{dummyData?.data}</p>
      {/* )} */}
      <AnswerInput
  pattern={dummyData?.encoded_answer}
  value={answer}
  onChange={setAnswer}
/>
    </div>
  );
};

export default DetailPage;