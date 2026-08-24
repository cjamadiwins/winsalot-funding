import BrentsEssentialsTrainingContent from "@/components/leadgen/BrentsEssentialsTrainingContent";
import MantraCollabTrainingContent from "@/components/leadgen/MantraCollabTrainingContent";
import ConnectProposeCloseCourse from "@/components/ConnectProposeCloseCourse";

export default function LeadgenAgentTrainingPage() {
  return (
    <div className="space-y-6">
      <ConnectProposeCloseCourse crm="leadgen" />
      <MantraCollabTrainingContent />
      <BrentsEssentialsTrainingContent dashboardHref="/leadgen/agent" />
    </div>
  );
}