import BrentsEssentialsTrainingContent from "@/components/leadgen/BrentsEssentialsTrainingContent";
import ConnectProposeCloseCourse from "@/components/ConnectProposeCloseCourse";

export default function LeadgenAgentTrainingPage() {
  return (
    <div className="space-y-6">
      <ConnectProposeCloseCourse crm="leadgen" />
      <BrentsEssentialsTrainingContent dashboardHref="/leadgen/agent" />
    </div>
  );
}