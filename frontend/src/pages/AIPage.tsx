import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChatInterface } from '@/components/ai/ChatInterface'
import { PDFAnalyzer } from '@/components/ai/PDFAnalyzer'
import { FundComparator } from '@/components/ai/FundComparator'
import { ScenarioSimulator } from '@/components/ai/ScenarioSimulator'
import { BiasDetector } from '@/components/ai/BiasDetector'

export function AIPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="IA Asesor" subtitle="Chat con Claude sobre tu cartera" />

      <div className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="chat" className="space-y-4">
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="pdf">Analizar PDF</TabsTrigger>
            <TabsTrigger value="compare">Comparar fondos</TabsTrigger>
            <TabsTrigger value="scenario">Escenarios</TabsTrigger>
            <TabsTrigger value="biases">Sesgos</TabsTrigger>
          </TabsList>

          <TabsContent value="chat">
            <ChatInterface />
          </TabsContent>
          <TabsContent value="pdf">
            <PDFAnalyzer />
          </TabsContent>
          <TabsContent value="compare">
            <FundComparator />
          </TabsContent>
          <TabsContent value="scenario">
            <ScenarioSimulator />
          </TabsContent>
          <TabsContent value="biases">
            <BiasDetector />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
